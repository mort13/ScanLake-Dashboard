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

  // ── Parquet loading ───────────────────────────────────────────
  // ScanLake Refinery publishes one consolidated file per table to the derived
  // bucket: deduplicated per capture, one schema, names normalised.
  async function loadParquets() {
    status.value = 'loading'
    loadingProgress.value = { loaded: 0, total: TABLES.length }

    for (const table of TABLES) {
      loadingMessage.value = `Loading ${table}…`
      try {
        await _registerFile(`/api/derived/consolidated/${table}.parquet`, table)
      } catch (err) {
        error.value = `Failed to load ${table}: ${err.message}`
        status.value = 'error'
        return
      }
      loadingProgress.value.loaded++
    }

    status.value = 'ready'
    loadingMessage.value = ''
  }

  async function _registerFile(url, viewName) {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buffer = await res.arrayBuffer()
    await _db.registerFileBuffer(viewName + '.parquet', new Uint8Array(buffer))
    await _conn.query(
      `CREATE OR REPLACE VIEW "${viewName}" AS SELECT * FROM read_parquet('${viewName}.parquet')`,
    )
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
