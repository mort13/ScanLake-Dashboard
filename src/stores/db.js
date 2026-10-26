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

const TABLES = ['scans', 'compositions', 'confidences']
const CACHE_NAME = 'scanlake-parquet'
const REFRESH_INTERVAL_MS = 15 * 60 * 1000

const fileKey = (table) => `consolidated/${table}.parquet`
const cacheKey = (table, hash) => `${location.origin}/api/derived/${fileKey(table)}?sha256=${hash}`

export const useDbStore = defineStore('db', () => {
  // ── State ──────────────────────────────────────────────────────
  const status = ref('idle') // idle | initializing | loading | ready | error
  const error = ref(null)
  const loadingMessage = ref('')
  const loadingProgress = ref({ loaded: 0, total: 0 })
  const dataVersion = ref(0) // bumped when a background refresh swaps in new data

  let _db = null
  let _conn = null
  let _loaded = {} // table → { hash, fileName } currently behind its view
  let _fileSeq = 0
  let _refreshTimer = null
  let _refreshing = false

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
  // bucket: deduplicated per capture, one schema, names normalised.
  // Files are cached in the browser under the sha256 listed in the bucket's
  // manifest, so a reload downloads only the files that changed since.
  async function loadParquets() {
    status.value = 'loading'
    loadingProgress.value = { loaded: 0, total: TABLES.length }
    loadingMessage.value = 'Checking for new data…'

    const hashes = await _fetchManifestHashes()
    const cache = await _openCache()

    for (const table of TABLES) {
      loadingMessage.value = `Loading ${table}…`
      try {
        await _loadTable(table, hashes, cache)
      } catch (err) {
        error.value = `Failed to load ${table}: ${err.message}`
        status.value = 'error'
        return
      }
      loadingProgress.value.loaded++
    }

    // Drop superseded versions — only when the manifest says which ones are current
    if (hashes) await _pruneCache(cache)

    status.value = 'ready'
    loadingMessage.value = ''
    if (!_refreshTimer) _refreshTimer = setInterval(refresh, REFRESH_INTERVAL_MS)
  }

  // ── Background refresh ────────────────────────────────────────
  // The Refinery republishes hourly. An open tab re-reads the manifest, swaps in
  // only the tables whose hash changed, then bumps dataVersion so panels re-run.
  async function refresh() {
    if (status.value !== 'ready' || _refreshing) return
    _refreshing = true
    let swapped = false
    try {
      const hashes = await _fetchManifestHashes()
      if (!hashes) return
      const changed = TABLES.filter((t) => {
        const hash = hashes[fileKey(t)]
        return hash && hash !== _loaded[t]?.hash
      })
      if (changed.length === 0) return

      const cache = await _openCache()
      for (const table of changed) {
        await _loadTable(table, hashes, cache)
        swapped = true
      }
      await _pruneCache(cache)
    } catch (err) {
      console.warn('[db] Refresh failed, keeping the loaded data:', err.message)
    } finally {
      // Also after a partial failure: tables swapped so far are already live
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

  async function _loadTable(table, hashes, cache) {
    const hash = hashes?.[fileKey(table)] ?? null
    const buffer = await _fetchFile(`/api/derived/${fileKey(table)}`, cache, hash && cacheKey(table, hash))

    // A new file name per version, so the view switches over in one statement
    const fileName = `${table}_${++_fileSeq}.parquet`
    await _db.registerFileBuffer(fileName, new Uint8Array(buffer))
    await _conn.query(
      `CREATE OR REPLACE VIEW "${table}" AS SELECT * FROM read_parquet('${fileName}')`,
    )
    const previous = _loaded[table]
    _loaded[table] = { hash, fileName }
    if (previous) await _db.dropFile(previous.fileName).catch(() => {})
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
    const keep = TABLES.filter((t) => _loaded[t]?.hash).map((t) => cacheKey(t, _loaded[t].hash))
    try {
      for (const req of await cache.keys()) {
        if (!keep.includes(req.url)) await cache.delete(req)
      }
    } catch (err) {
      console.warn('[db] Cache cleanup failed:', err.message)
    }
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
    isReady,
    init,
    refresh,
    runQuery,
    describeTable,
  }
})
