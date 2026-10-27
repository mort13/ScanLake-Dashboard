import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAliasesStore } from './aliases'

/**
 * Filter state of the Results tab, kept here so it survives switching tabs.
 * The filters are independent of the dashboard sidebar and apply to whichever
 * result table is shown, on the columns that table has:
 *   location → gravity_well, system, region
 *   deposit  → deposit
 *   material → material
 */
export const useResultsStore = defineStore('results', () => {
  const active = ref(null) // selected job name
  const locationFilters = ref([]) // strings
  const depositFilters = ref([]) // { value, negated }
  const materialFilters = ref([]) // { value, negated }
  const sort = ref({ column: null, desc: false })

  const LOCATION_COLUMNS = ['gravity_well', 'system', 'region']

  /** Filters the table can't use, as [label, ...] — shown as a hint in the UI. */
  function unusedFilters(columns) {
    const unused = []
    if (locationFilters.value.length && !LOCATION_COLUMNS.some((c) => columns.includes(c))) {
      unused.push('location')
    }
    if (depositFilters.value.length && !columns.includes('deposit')) unused.push('deposit')
    if (materialFilters.value.length && !columns.includes('material')) unused.push('material')
    return unused
  }

  /** WHERE fragment (no leading WHERE) for a table with the given columns. */
  function buildWhere(columns) {
    const al = useAliasesStore()
    const parts = []

    const locCols = LOCATION_COLUMNS.filter((c) => columns.includes(c))
    if (locationFilters.value.length && locCols.length) {
      const vals = locationFilters.value.flatMap((v) => al.expandAlias('location', v)).map(sqlStr)
      parts.push('(' + locCols.map((c) => `"${c}" IN (${vals.join(', ')})`).join(' OR ') + ')')
    }

    const addNamed = (column, dimension, filters) => {
      if (!filters.length || !columns.includes(column)) return
      const expand = (negated) =>
        filters
          .filter((f) => f.negated === negated)
          .flatMap((f) => al.expandAlias(dimension, f.value))
          .map(sqlStr)
      const pos = expand(false)
      const neg = expand(true)
      if (pos.length) parts.push(`"${column}" IN (${pos.join(', ')})`)
      if (neg.length) parts.push(`COALESCE("${column}", '') NOT IN (${neg.join(', ')})`)
    }
    addNamed('deposit', 'deposit', depositFilters.value)
    addNamed('material', 'material', materialFilters.value)

    return parts.length ? parts.join(' AND ') : '1=1'
  }

  function clearFilters() {
    locationFilters.value = []
    depositFilters.value = []
    materialFilters.value = []
  }

  return {
    active,
    locationFilters,
    depositFilters,
    materialFilters,
    sort,
    unusedFilters,
    buildWhere,
    clearFilters,
  }
})

function sqlStr(v) {
  return "'" + String(v).replace(/'/g, "''") + "'"
}
