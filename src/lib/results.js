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

// Bookkeeping columns, in the order they are shown after the real data:
// scan amounts, then last/first scan, then total mass
const META_GROUPS = [
  /(^|_)scans$|^rocks$/,
  /_scan_at$/,
  /(^|_)total_(material_)?(mass|scu)$/,
]

/** Moves the metadata columns (scan counts, scan dates, total mass) to the end; other columns keep their order. */
export function metaLast(schema) {
  const rank = (c) => {
    const i = META_GROUPS.findIndex((re) => re.test(c.column_name))
    return i < 0 ? -1 : i
  }
  const data = schema.filter((c) => rank(c) < 0)
  const meta = schema.filter((c) => rank(c) >= 0).sort((a, b) => rank(a) - rank(b))
  return [...data, ...meta]
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

/** Seconds as "45 s" or "2 min 05 s". */
export function formatGap(seconds) {
  if (seconds == null) return '–'
  const s = Math.round(seconds)
  return s < 120 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`
}

// Quality bands of 100, as in the quality_<lo>_<hi>_<mode>_pct columns
export const QUALITY_BANDS = ['0_100', '101_200', '201_300', '301_400', '401_500', '501_600', '601_700', '701_800', '801_900', '901_1000']
export const BAND_LABELS = QUALITY_BANDS.map((b) => b.replace('_', '–'))
// Each band is published twice: as a share of the SCU and as a share of the scans
export const BAND_COLUMNS = {
  scu: QUALITY_BANDS.map((b) => `quality_${b}_scu_pct`),
  count: QUALITY_BANDS.map((b) => `quality_${b}_count_pct`),
}
