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

export const useDbStore = defineStore('db', () => {
  // ── State ──────────────────────────────────────────────────────
  const status = ref('idle') // idle | initializing | loading | ready | error
  const error = ref(null)
  const loadingMessage = ref('')
  const loadingProgress = ref({ loaded: 0, total: 0 })

  let _db = null
  let _conn = null

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

  // ── Parquet discovery and loading ─────────────────────────────
  async function loadParquets() {
    status.value = 'loading'
    loadingMessage.value = 'Listing parquet files…'

    const allObjects = []
    let cursor = null

    try {
      do {
        const params = new URLSearchParams({ limit: '1000' })
        if (cursor) params.set('cursor', cursor)
        const res = await fetch(`/api/files?${params}`)
        if (!res.ok) throw new Error(`Gateway list failed: HTTP ${res.status}`)
        const data = await res.json()
        allObjects.push(...(data.objects ?? []))
        cursor = data.truncated && data.cursor ? data.cursor : null
      } while (cursor)
    } catch (err) {
      error.value = err.message
      status.value = 'error'
      return
    }

    const parquetFiles = allObjects.filter((o) => o.key.endsWith('.parquet'))
    loadingProgress.value = { loaded: 0, total: parquetFiles.length }
    loadingMessage.value = `Loading 0 / ${parquetFiles.length} files…`

    const collectionViews = new Map() // type → viewName[]

    for (const obj of parquetFiles) {
      const parts = obj.key.split('/')
      const fileName = parts[parts.length - 1].replace('.parquet', '')
      const type = fileName.match(/^(scans|compositions|confidences)/)?.[1] ?? 'data'
      const userId = (parts.length >= 5 ? parts[parts.length - 3] : 'u').slice(0, 8)
      const sessionId = (parts.length >= 5 ? parts[parts.length - 2] : 's').slice(0, 8)
      const batch = parseInt(fileName.match(/batch(\d+)/)?.[1] ?? '1', 10)
      const safeSession = sessionId.replace(/[^a-zA-Z0-9]/g, '_')
      const safeUser = userId.replace(/[^a-zA-Z0-9]/g, '_')
      const viewName = `${type}_${safeUser}_${safeSession}_b${batch}`

      await _registerFile(`/api/files/${obj.key}`, viewName)

      if (!collectionViews.has(type)) collectionViews.set(type, [])
      collectionViews.get(type).push(viewName)

      loadingProgress.value.loaded++
      loadingMessage.value = `Loading ${loadingProgress.value.loaded} / ${parquetFiles.length} files…`
    }

    for (const [type, views] of collectionViews) {
      await _createUnionView(type, views)
    }

    status.value = 'ready'
    loadingMessage.value = ''
  }

  async function _registerFile(url, viewName) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buffer = await res.arrayBuffer()
      await _db.registerFileBuffer(viewName + '.parquet', new Uint8Array(buffer))
      await _conn.query(
        `CREATE VIEW IF NOT EXISTS "${viewName}" AS SELECT * FROM read_parquet('${viewName}.parquet')`,
      )
    } catch (err) {
      console.warn(`[db] Failed to load ${viewName}:`, err.message)
    }
  }

  async function _createUnionView(type, views) {
    if (views.length === 0) return
    // Try simple union first; fall back to normalized union on schema mismatch
    try {
      const union = views.map((v) => `SELECT * FROM "${v}"`).join(' UNION ALL ')
      await _conn.query(`DROP VIEW IF EXISTS "${type}"`)
      await _conn.query(`CREATE VIEW "${type}" AS ${union}`)
    } catch {
      await _createNormalizedUnionView(type, views)
    }
  }

  async function _createNormalizedUnionView(type, views) {
    const viewCols = new Map()
    const allCols = new Set()

    for (const v of views) {
      try {
        const rows = await runQuery(`DESCRIBE "${v}"`)
        const cols = rows.map((r) => r.column_name)
        viewCols.set(v, cols)
        cols.forEach((c) => allCols.add(c))
      } catch {}
    }

    const superSet = [...allCols]
    const normViews = []

    for (const v of views) {
      const cols = viewCols.get(v) ?? []
      const selectList = superSet
        .map((col) => {
          if (cols.includes(col)) return `"${col}"`
          // Map legacy column renames
          if (col === 'user_id' && cols.includes('user')) return `"user" AS user_id`
          if (col === 'user_name' && cols.includes('user')) return `"user" AS user_name`
          return `NULL AS "${col}"`
        })
        .join(', ')

      const normView = `${v}_norm`
      try {
        await _conn.query(`DROP VIEW IF EXISTS "${normView}"`)
        await _conn.query(`CREATE VIEW "${normView}" AS SELECT ${selectList} FROM "${v}"`)
        normViews.push(normView)
      } catch {
        normViews.push(v)
      }
    }

    const union = normViews.map((v) => `SELECT * FROM "${v}"`).join(' UNION ALL ')
    await _conn.query(`DROP VIEW IF EXISTS "${type}"`)
    await _conn.query(`CREATE VIEW "${type}" AS ${union}`)
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
    isReady,
    init,
    runQuery,
    describeTable,
  }
})
