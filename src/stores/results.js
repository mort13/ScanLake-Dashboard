import { defineStore } from 'pinia'
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAliasesStore } from './aliases'
import { useFiltersStore } from './filters'

/**
 * Turns the filter sidebar's selections (shared with the dashboard) into SQL for
 * the result tables, on the columns each table has:
 *   location → gravity_well, system, region
 *   deposit  → deposit
 *   material → material
 */
export const useResultsStore = defineStore('results', () => {
  const active = ref(null) // selected job name
  // The sidebar's own state; quality and date have no counterpart in the results
  const { locationFilters, depositFilters, materialFilters } = storeToRefs(useFiltersStore())
  const sort = ref({ column: null, desc: false })
  // The open location and what is picked inside it live here, not in the views,
  // so they survive switching to another tab and back
  const detail = ref(null) // { system, gravity_well, region } of the open location card
  const selection = ref([]) // [{ type: 'deposit' | 'material', name }] kept highlighted
  const qualityMode = ref('scu') // which quality band columns the detail shows

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

  /**
   * WHERE fragment (no leading WHERE) for a table with the given columns.
   * `skip` lists filters to leave out: 'material'.
   */
  function buildWhere(columns, skip = []) {
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
    if (!skip.includes('material')) addNamed('material', 'material', materialFilters.value)

    return parts.length ? parts.join(' AND ') : '1=1'
  }

  return {
    active,
    locationFilters,
    depositFilters,
    materialFilters,
    sort,
    detail,
    selection,
    qualityMode,
    unusedFilters,
    buildWhere,
  }
})

function sqlStr(v) {
  return "'" + String(v).replace(/'/g, "''") + "'"
}
