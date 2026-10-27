/** Helpers for reading the Refinery's results_<job> views. */

/**
 * SELECT list that turns every column into something plain JS can show:
 * dates and timestamps become strings (UTC), decimals become doubles.
 * @param {{column_name: string, column_type: string}[]} schema  DESCRIBE output
 */
export function selectList(schema) {
  return schema
    .map(({ column_name: c, column_type: t }) => {
      const q = `"${c}"`
      if (/^TIMESTAMP/i.test(t)) return `strftime(${q}::TIMESTAMP, '%Y-%m-%d %H:%M') AS ${q}`
      if (/^DATE/i.test(t)) return `${q}::VARCHAR AS ${q}`
      if (/^DECIMAL|^HUGEINT/i.test(t)) return `${q}::DOUBLE AS ${q}`
      return q
    })
    .join(', ')
}

/** "deposit_materials_by_region" → "Deposit materials by region" */
export function prettyName(name) {
  const s = name.replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Cell text: thousands separators, at most two decimals, a dash for NULL. */
export function formatCell(v) {
  if (v === null || v === undefined) return '–'
  if (typeof v === 'number') {
    return Number.isInteger(v)
      ? v.toLocaleString()
      : v.toLocaleString(undefined, { maximumFractionDigits: 2 })
  }
  return String(v)
}
