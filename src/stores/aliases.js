import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * Alias store — loads /aliases.json and provides helpers for:
 *   - Generating SQL CASE WHEN expressions (for GROUP BY aliasing in queries)
 *   - Resolving raw values to display names (for UI)
 *   - Expanding display names back to raw values (for WHERE clause filtering)
 *   - Deduplicating autocomplete lists by display name
 *
 * Dimensions: 'deposit' | 'material' | 'user_name' | 'location'
 * 'location' covers gravity_well, system and region uniformly.
 */
export const useAliasesStore = defineStore('aliases', () => {
  const groups = ref({ deposit: [], material: [], user_name: [], location: [] })
  const isLoaded = ref(false)

  async function load() {
    try {
      const res = await fetch('/aliases.json')
      if (!res.ok) return
      const data = await res.json()
      groups.value = {
        deposit:   Array.isArray(data.deposit)   ? data.deposit   : [],
        material:  Array.isArray(data.material)  ? data.material  : [],
        user_name: Array.isArray(data.user_name) ? data.user_name : [],
        location:  Array.isArray(data.location)  ? data.location  : [],
      }
    } catch {
      // aliases.json is optional — silently continue with no aliases
    } finally {
      isLoaded.value = true
    }
  }

  /**
   * Build a SQL CASE WHEN expression that maps raw values to their display names.
   * Returns `sqlCol` unchanged when the dimension has no configured aliases.
   *
   * @param {string} sqlCol  - SQL column reference, e.g. 's.deposit'
   * @param {string} dimension - 'deposit' | 'material' | 'user_name' | 'location'
   * @returns {string} SQL expression
   */
  function buildCaseExpr(sqlCol, dimension) {
    const list = groups.value[dimension] ?? []
    const whens = list
      .filter(g => g.values?.length > 0)
      .map(g => {
        const inList = g.values.map(v => `'${String(v).replace(/'/g, "''")}'`).join(', ')
        const display = String(g.display).replace(/'/g, "''")
        return `WHEN ${sqlCol} IN (${inList}) THEN '${display}'`
      })
    if (whens.length === 0) return sqlCol
    return `CASE ${whens.join(' ')} ELSE ${sqlCol} END`
  }

  /**
   * Resolve a single raw value to its alias display name.
   * Returns the value unchanged if no alias covers it.
   */
  function resolveDisplay(dimension, value) {
    for (const g of groups.value[dimension] ?? []) {
      if (g.values?.includes(value)) return g.display
    }
    return value
  }

  /**
   * Expand a display name (or raw value) to all raw values it covers.
   * Used so filter WHERE clauses match every underlying raw value.
   */
  function expandAlias(dimension, nameOrValue) {
    const list = groups.value[dimension] ?? []
    const group = list.find(g => g.display === nameOrValue)
    return group ? group.values : [nameOrValue]
  }

  /**
   * Map a list of raw values through aliases, deduplicating by display name.
   * Used for autocomplete lists so aliased values appear as one entry.
   */
  function applyToList(dimension, rawValues) {
    const seen = new Set()
    const result = []
    for (const v of rawValues) {
      const display = resolveDisplay(dimension, v)
      if (!seen.has(display)) {
        seen.add(display)
        result.push(display)
      }
    }
    return result
  }

  return { groups, isLoaded, load, buildCaseExpr, resolveDisplay, expandAlias, applyToList }
})
