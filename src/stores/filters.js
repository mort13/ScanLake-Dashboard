import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useDbStore } from './db'
import { useAliasesStore } from './aliases'

export const useFiltersStore = defineStore('filters', () => {
  // ── Filter State ───────────────────────────────────────────────
  // Location: array of strings, matches gravity_well OR system OR region
  const locationFilters = ref([])

  // Deposit: array of { value: string, negated: boolean }
  const depositFilters = ref([
    { value: "num", negated: true },
    { value: "none", negated: true }
  ])

  // Material: array of { value: string, negated: boolean }
  const materialFilters = ref([
    { value: "num", negated: true },
    { value: "none", negated: true }
  ])

  // Quality range [min, max], 0–1000
  const qualityRange = ref([0, 1000])

  // Date range [from, to] as 'YYYY-MM-DD' strings, null = unconstrained
  const dateRange  = ref([null, null])
  const dateColumn = ref(null)   // discovered TIMESTAMP/DATE column in scans
  const dateMin    = ref(null)   // earliest date in the dataset
  const dateMax    = ref(null)   // latest date in the dataset

  // ── Autocomplete ───────────────────────────────────────────────
  const acLocation = ref([])
  const acDeposit = ref([])
  const acMaterial = ref([])

  const hasActiveFilters = computed(
    () =>
      locationFilters.value.length > 0 ||
      depositFilters.value.length > 0 ||
      materialFilters.value.length > 0 ||
      qualityRange.value[0] !== 0 ||
      qualityRange.value[1] !== 1000 ||
      dateRange.value[0] !== null ||
      dateRange.value[1] !== null,
  )

  // ── Load autocomplete values from DuckDB ───────────────────────
  async function loadAutocomplete() {
    const db = useDbStore()
    if (!db.isReady) return
    try {
      const [locs, deps, mats] = await Promise.all([
        db.runQuery(`
          SELECT DISTINCT val FROM (
            SELECT gravity_well AS val FROM scans WHERE gravity_well IS NOT NULL
            UNION
            SELECT system        AS val FROM scans WHERE system IS NOT NULL
            UNION
            SELECT region        AS val FROM scans WHERE region IS NOT NULL
          ) ORDER BY val
        `),
        db.runQuery(`
          SELECT DISTINCT deposit AS val FROM scans
          WHERE deposit IS NOT NULL ORDER BY val
        `),
        db.runQuery(`
          SELECT DISTINCT type AS val FROM compositions
          WHERE type IS NOT NULL
            AND type NOT IN ('inert_materials','none','Inert Materials','inert')
          ORDER BY val
        `),
      ])
      const al = useAliasesStore()
      acLocation.value = al.applyToList('location',  locs.map((r) => r.val))
      acDeposit.value  = al.applyToList('deposit',   deps.map((r) => r.val))
      acMaterial.value = al.applyToList('material',  mats.map((r) => r.val))
    } catch (err) {
      console.warn('[filters] autocomplete load failed:', err.message)
    }

    // Discover date/timestamp column and its range
    try {
      const schema = await db.describeTable('scans')
      const dateCol = schema.find((r) =>
        /^TIMESTAMP|^DATE/i.test(r.column_type),
      )?.column_name ?? null
      dateColumn.value = dateCol
      if (dateCol && /^[a-z0-9_]+$/i.test(dateCol)) {
        const [bounds] = await db.runQuery(
          `SELECT MIN("${dateCol}")::VARCHAR AS mn, MAX("${dateCol}")::VARCHAR AS mx FROM scans`,
        )
        dateMin.value = bounds?.mn?.slice(0, 10) ?? null
        dateMax.value = bounds?.mx?.slice(0, 10) ?? null
      }
    } catch (err) {
      console.warn('[filters] date column detection failed:', err.message)
    }
  }

  // ── SQL fragment generators ────────────────────────────────────
  /**
   * Returns a SQL WHERE fragment (without leading WHERE) for use in queries
   * that join `scans s` and `compositions c`.
   * @param {'both'|'scans'|'compositions'} tables - which tables are in the query
   */
  function buildWhere(tables = 'both') {
    const parts = []
    const hasScans = tables === 'both' || tables === 'scans'
    const hasComps = tables === 'both' || tables === 'compositions'

    const al = useAliasesStore()

    if (locationFilters.value.length > 0 && hasScans) {
      // defensive: support both plain strings and legacy {value,negated} objects
      // expand alias display names to all underlying raw values
      const rawVals = locationFilters.value
        .flatMap((f) => al.expandAlias('location', typeof f === 'string' ? f : f.value))
        .map(sqlStr)
        .join(', ')
      parts.push(`(s.gravity_well IN (${rawVals}) OR s.system IN (${rawVals}) OR s.region IN (${rawVals}))`)
    }

    if (depositFilters.value.length > 0 && hasScans) {
      const pos = depositFilters.value.filter((m) => !m.negated)
        .flatMap((m) => al.expandAlias('deposit', m.value)).map(sqlStr)
      const neg = depositFilters.value.filter((m) => m.negated)
        .flatMap((m) => al.expandAlias('deposit', m.value)).map(sqlStr)
      if (pos.length > 0) parts.push(`s.deposit IN (${pos.join(', ')})`)
      if (neg.length > 0) parts.push(`COALESCE(s.deposit,'') NOT IN (${neg.join(', ')})`)
    }

    if (materialFilters.value.length > 0 && hasComps) {
      const pos = materialFilters.value.filter((m) => !m.negated)
        .flatMap((m) => al.expandAlias('material', m.value)).map(sqlStr)
      const neg = materialFilters.value.filter((m) => m.negated)
        .flatMap((m) => al.expandAlias('material', m.value)).map(sqlStr)
      if (pos.length > 0) parts.push(`c.type IN (${pos.join(', ')})`)
      if (neg.length > 0) parts.push(`c.type NOT IN (${neg.join(', ')})`)
    }

    if (hasComps && (qualityRange.value[0] !== 0 || qualityRange.value[1] !== 1000)) {
      parts.push(`c.quality >= ${qualityRange.value[0]} AND c.quality <= ${qualityRange.value[1]}`)
    }

    if (hasScans && dateColumn.value && /^[a-z0-9_]+$/i.test(dateColumn.value)) {
      const col = `s."${dateColumn.value}"::DATE`
      const [from, to] = dateRange.value
      if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) parts.push(`${col} >= DATE '${from}'`)
      if (to   && /^\d{4}-\d{2}-\d{2}$/.test(to))   parts.push(`${col} <= DATE '${to}'`)
    }

    return parts.length > 0 ? parts.join(' AND ') : '1=1'
  }

  /** Same as buildWhere but for queries with only scans (no compositions join). */
  function buildWhereScan() {
    return buildWhere('scans')
  }

  function clearAll() {
    locationFilters.value = []
    depositFilters.value = []
    materialFilters.value = []
    qualityRange.value = [0, 1000]
    dateRange.value = [null, null]
  }

  // A single string that changes whenever any filter changes — used by panels as watch target
  const filterSignature = computed(() => [
    locationFilters.value.map((f) => typeof f === 'string' ? f : (f.negated ? '!' : '') + f.value).join('\x00'),
    depositFilters.value.map((m) => (m.negated ? '!' : '') + m.value).join('\x00'),
    materialFilters.value.map((m) => (m.negated ? '!' : '') + m.value).join('\x00'),
    qualityRange.value.join('-'),
    dateRange.value.join('~'),
  ].join('|'))

  return {
    locationFilters,
    depositFilters,
    materialFilters,
    qualityRange,
    dateRange,
    dateColumn,
    dateMin,
    dateMax,
    acLocation,
    acDeposit,
    acMaterial,
    hasActiveFilters,
    filterSignature,
    loadAutocomplete,
    buildWhere,
    buildWhereScan,
    clearAll,
  }
})

function sqlStr(v) {
  return "'" + String(v).replace(/'/g, "''") + "'"
}
