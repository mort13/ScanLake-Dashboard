/**
 * Convert an array of row objects to a RFC-4180 CSV string.
 */
export function rowsToCsv(rows) {
  if (!rows.length) return ''
  const cols = Object.keys(rows[0])
  const esc = (v) => {
    const s = v == null ? '' : String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }
  const header = cols.map(esc).join(',')
  const body   = rows.map((r) => cols.map((c) => esc(r[c])).join(',')).join('\n')
  return `${header}\n${body}`
}

/**
 * Trigger a browser download of a CSV string.
 */
export function downloadCsv(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
