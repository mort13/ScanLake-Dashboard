import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as duckdb from '@duckdb/duckdb-wasm'

const DIST = 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.29.0/dist/'
const BUNDLES = {
  mvp: {
    mainModule: DIST + 'duckdb-mvp.wasm',
    mainWorker: DIST + 'duckdb-browser-mvp.worker.js',
  },
  eh: {
    mainModule: DIST + 'duckdb-eh.wasm',
    mainWorker: DIST + 'duckdb-browser-eh.worker.js',
  },
}

// Only what the dashboard reads: the scan and composition tables, and the result jobs it shows
const TABLES = ['scans', 'compositions']
const RESULT_JOBS = ['deposit_materials_by_region', 'material_entries_by_region', 'highscores']
const RESULT_KEY_RE = /^results\/([a-z0-9_]+)\.parquet$/
const CACHE_NAME = 'scanlake-parquet'
const REFRESH_INTERVAL_MS = 15 * 60 * 1000
const SESSIONS_STORAGE_KEY = 'scanlake.knownSessions'
const MAX_NEW_SESSIONS = 50

const cacheKey = (key, hash) => `${location.origin}/api/derived/${key}?sha256=${hash}`

export const useDbStore = defineStore('db', () => {
  // ── State ──────────────────────────────────────────────────────
  const status = ref('idle') // idle | initializing | loading | ready | error
  const error = ref(null)
  const loadingMessage = ref('')
  const loadingProgress = ref({ loaded: 0, total: 0 })
  const dataVersion = ref(0) // bumped when a background refresh swaps in new data
  const resultTables = ref([]) // job names whose results_<job> view is loaded
  const newSessions = ref([]) // sessions that appeared since the last visit / refresh

  let _db = null
  let _conn = null
  let _loaded = {} // view → { key, hash, fileName } currently behind the view
  let _fileSeq = 0
  let _refreshTimer = null
  let _refreshing = false
  let _knownSessions = null // Set of session ids already seen; null until a baseline exists

  const isReady = computed(() => status.value === 'ready')

  // ── DuckDB bootstrap ───────────────────────────────────────────
  async function init() {
    if (status.value === 'ready' || status.value === 'initializing') return
    status.value = 'initializing'
    error.value = null
    loadingMessage.value = 'Initialising DuckDB…'

    try {
      const bundle = await duckdb.selectBundle(BUNDLES)

      const workerUrl = URL.createObjectURL(
        new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' }),
      )
      const worker = new Worker(workerUrl)
      _db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker)
      await _db.instantiate(bundle.mainModule)
      URL.revokeObjectURL(workerUrl)
      _conn = await _db.connect()

      await loadParquets()
    } catch (err) {
      error.value = err.message
      status.value = 'error'
    }
  }

  // ── Parquet loading ───────────────────────────────────────────
  // ScanLake Refinery publishes one consolidated file per table to the derived
  // bucket (deduplicated per capture, one schema, names normalised) plus one
  // results/<job>.parquet per job; the ones in RESULT_JOBS are exposed here as the view results_<job>.
  // Files are cached in the browser under the sha256 listed in the bucket's
  // manifest, so a reload downloads only the files that changed since.
  async function loadParquets() {
    status.value = 'loading'
    loadingMessage.value = 'Checking for new data…'

    const hashes = await _fetchManifestHashes()
    const cache = await _openCache()
    const targets = _targets(hashes)
    loadingProgress.value = { loaded: 0, total: targets.length }

    for (const t of targets) {
      loadingMessage.value = `Loading ${t.view}…`
      try {
        await _loadFile(t, cache)
      } catch (err) {
        if (t.required) {
          error.value = `Failed to load ${t.view}: ${err.message}`
          status.value = 'error'
          return
        }
        console.warn(`[db] Skipping ${t.view}:`, err.message)
      }
      loadingProgress.value.loaded++
    }
    _syncResultTables()

    // Drop superseded versions — only when the manifest says which ones are current
    if (hashes) await _pruneCache(cache)

    await _detectNewSessions(_readKnownSessions())

    status.value = 'ready'
    loadingMessage.value = ''
    if (!_refreshTimer) _refreshTimer = setInterval(refresh, REFRESH_INTERVAL_MS)
  }

  /** Files to load: the consolidated tables (required) and the results files of RESULT_JOBS. */
  function _targets(hashes) {
    const targets = TABLES.map((view) => {
      const key = `consolidated/${view}.parquet`
      return { view, key, hash: hashes?.[key] ?? null, required: true }
    })
    for (const [key, hash] of Object.entries(hashes ?? {})) {
      const m = RESULT_KEY_RE.exec(key)
      if (m && RESULT_JOBS.includes(m[1])) targets.push({ view: `results_${m[1]}`, key, hash, required: false })
    }
    return targets
  }

  // ── Background refresh ────────────────────────────────────────
  // The Refinery republishes hourly. An open tab re-reads the manifest, swaps in
  // only the files whose hash changed, then bumps dataVersion so panels re-run.
  async function refresh() {
    if (status.value !== 'ready' || _refreshing) return
    _refreshing = true
    let swapped = false
    try {
      const hashes = await _fetchManifestHashes()
      if (!hashes) return
      const targets = _targets(hashes).filter((t) => t.hash)
      const changed = targets.filter((t) => t.hash !== _loaded[t.view]?.hash)
      const gone = Object.keys(_loaded).filter(
        (v) => v.startsWith('results_') && !targets.some((t) => t.view === v),
      )
      if (changed.length === 0 && gone.length === 0) return

      const cache = await _openCache()
      for (const t of changed) {
        await _loadFile(t, cache)
        swapped = true
      }
      for (const view of gone) {
        await _dropView(view)
        swapped = true
      }
      _syncResultTables()
      await _pruneCache(cache)
      if (changed.some((t) => t.view === 'scans')) await _detectNewSessions(_knownSessions)
    } catch (err) {
      console.warn('[db] Refresh failed, keeping the loaded data:', err.message)
    } finally {
      // Also after a partial failure: files swapped so far are already live
      if (swapped) dataVersion.value++
      _refreshing = false
    }
  }

  /** { key: sha256 } from the derived bucket's manifest, or null if it can't be read. */
  async function _fetchManifestHashes() {
    try {
      const res = await fetch('/api/derived/manifest.json', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const manifest = await res.json()
      return Object.fromEntries((manifest.files ?? []).map((f) => [f.key, f.sha256]))
    } catch (err) {
      console.warn('[db] Manifest unavailable:', err.message)
      return null
    }
  }

  async function _loadFile({ view, key, hash }, cache) {
    const buffer = await _fetchFile(`/api/derived/${key}`, cache, hash && cacheKey(key, hash))

    // A new file name per version, so the view switches over in one statement
    const fileName = `${view}_${++_fileSeq}.parquet`
    await _db.registerFileBuffer(fileName, new Uint8Array(buffer))
    await _conn.query(
      `CREATE OR REPLACE VIEW "${view}" AS SELECT * FROM read_parquet('${fileName}')`,
    )
    const previous = _loaded[view]
    _loaded[view] = { key, hash, fileName }
    if (previous) await _db.dropFile(previous.fileName).catch(() => {})
  }

  async function _dropView(view) {
    await _conn.query(`DROP VIEW IF EXISTS "${view}"`)
    await _db.dropFile(_loaded[view].fileName).catch(() => {})
    delete _loaded[view]
  }

  function _syncResultTables() {
    resultTables.value = Object.keys(_loaded)
      .filter((v) => v.startsWith('results_'))
      .map((v) => v.slice('results_'.length))
      .sort()
  }

  async function _openCache() {
    try {
      return await caches.open(CACHE_NAME)
    } catch {
      return null // Cache Storage needs a secure context (https or localhost)
    }
  }

  async function _fetchFile(url, cache, key) {
    if (cache && key) {
      const hit = await cache.match(key, { ignoreVary: true }).catch(() => null)
      if (hit) return hit.arrayBuffer()
    }
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    if (cache && key) {
      await cache.put(key, res.clone()).catch((err) => {
        console.warn(`[db] Could not cache ${url}:`, err.message)
      })
    }
    return res.arrayBuffer()
  }

  /** Remove cached versions that no view uses any more. */
  async function _pruneCache(cache) {
    if (!cache) return
    const keep = Object.values(_loaded)
      .filter((l) => l.hash)
      .map((l) => cacheKey(l.key, l.hash))
    try {
      for (const req of await cache.keys()) {
        if (!keep.includes(req.url)) await cache.delete(req)
      }
    } catch (err) {
      console.warn('[db] Cache cleanup failed:', err.message)
    }
  }

  // ── New sessions ──────────────────────────────────────────────
  // Compares the sessions in `scans` with those seen before (the previous
  // refresh, or the last visit via localStorage) and lists the ones that are new.
  // Without a baseline (first visit) nothing is reported, only remembered.
  async function _detectNewSessions(previous) {
    let rows
    try {
      rows = await runQuery(`
        SELECT session_id,
               any_value(user_name)                       AS user_name,
               count(*)                                   AS scans,
               mode(gravity_well)                         AS gravity_well,
               max("timestamp")::TIMESTAMP::VARCHAR       AS last_scan
        FROM scans
        WHERE session_id IS NOT NULL
        GROUP BY session_id
      `)
    } catch (err) {
      console.warn('[db] Session check failed:', err.message)
      return
    }

    if (previous) {
      const fresh = rows
        .filter((r) => !previous.has(r.session_id))
        .sort((a, b) => String(b.last_scan).localeCompare(String(a.last_scan)))
      if (fresh.length > 0) {
        const have = new Set(fresh.map((r) => r.session_id))
        newSessions.value = [
          ...fresh,
          ...newSessions.value.filter((s) => !have.has(s.session_id)),
        ].slice(0, MAX_NEW_SESSIONS)
      }
    }

    _knownSessions = new Set(rows.map((r) => r.session_id))
    try {
      localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify([..._knownSessions]))
    } catch {
      // private mode or storage disabled — the baseline just won't survive a reload
    }
  }

  function _readKnownSessions() {
    try {
      const raw = localStorage.getItem(SESSIONS_STORAGE_KEY)
      return raw ? new Set(JSON.parse(raw)) : null
    } catch {
      return null
    }
  }

  function dismissNewSessions() {
    newSessions.value = []
  }

  // ── SQL query runner ──────────────────────────────────────────
  async function runQuery(sql) {
    if (!_conn) throw new Error('DuckDB not initialised')
    const result = await _conn.query(sql)
    const cols = result.schema.fields.map((f) => f.name)
    const rows = []
    for (let i = 0; i < result.numRows; i++) {
      const row = {}
      for (const col of cols) {
        const vec = result.getChild(col)
        let val = vec.get(i)
        if (typeof val === 'bigint') val = Number(val)
        row[col] = val
      }
      rows.push(row)
    }
    return rows
  }

  // ── Schema introspection ──────────────────────────────────────
  async function describeTable(tableName) {
    return runQuery(`DESCRIBE "${tableName}"`)
  }

  return {
    status,
    error,
    loadingMessage,
    loadingProgress,
    dataVersion,
    resultTables,
    newSessions,
    isReady,
    init,
    refresh,
    dismissNewSessions,
    runQuery,
    describeTable,
  }
})
