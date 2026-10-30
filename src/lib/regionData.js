/** Reads of results_deposit_materials_by_region shared by the Locations and Materials tabs. */

import { formatCell, formatGap } from '@/lib/results'

export const REGION_TABLE = 'deposit_materials_by_region'

/** Stable id of a location: system, gravity well and (possibly missing) region. */
export const locationKey = (r) => [r.system, r.gravity_well, r.region].join('|')

/** Name a location goes by on a card: its region, else its gravity well. */
export const locationName = (l) => l.region ?? l.gravity_well

/**
 * A material's concentration at a location is its average share over all scans
 * there: each deposit's avg_share_pct weighted by that deposit's scans, divided by
 * the scans of every deposit at the location (deposits without the material count
 * as 0). The material filter only selects which materials are listed; it doesn't
 * change the maths.
 *
 * @param db       the db store
 * @param results  the results store (its filters become the WHERE clause)
 * @param columns  column names of the results table
 * @param options  `byWell`: combine the regions of each gravity well into one location (region is null)
 * @returns {{
 *   locations: Map<string, {key, system, gravity_well, region, scans: number}>,
 *   cells: {key, system, gravity_well, region, material, share: number, presence: number, materialScans: number, rocks: number, gap: {avg: number, n: number} | null}[],
 * }}
 *   `cells` has one entry per location x material; `scans` of a location is its total scan count.
 */
export async function loadRegionConcentrations(db, results, columns, { byWell = false } = {}) {
  const table = `"results_${REGION_TABLE}"`
  const where = results.buildWhere(columns)
  const whereAll = results.buildWhere(columns, ['material'])
  const loc = byWell ? 'system, gravity_well' : 'system, gravity_well, region'
  const sel = byWell ? 'system, gravity_well, NULL AS region' : loc
  const [data, denoms] = await Promise.all([
    db.runQuery(
      `SELECT ${sel}, material, sum(avg_share_pct * composition_scans) AS weighted,
              sum(material_scans) AS material_scans,
              sum(deposit_avg_cluster_gap_seconds * deposit_cluster_gaps) AS gap_sum,
              sum(CASE WHEN deposit_avg_cluster_gap_seconds IS NOT NULL THEN deposit_cluster_gaps END) AS gap_n
       FROM ${table} WHERE material IS NOT NULL AND ${where} GROUP BY ${loc}, material`,
    ),
    db.runQuery(
      `SELECT ${sel}, sum(scans) AS scans, sum(location_scans) AS location_scans FROM (
         SELECT system, gravity_well, region, sum(scans) AS scans, max(location_scans) AS location_scans FROM (
           SELECT system, gravity_well, region, deposit, max(composition_scans) AS scans, max(location_scans) AS location_scans
           FROM ${table} WHERE ${whereAll} GROUP BY system, gravity_well, region, deposit
         ) GROUP BY system, gravity_well, region
       ) GROUP BY ${loc}`,
    ),
  ])

  const locations = new Map()
  const compositionScans = new Map()
  for (const d of denoms) {
    const key = locationKey(d)
    compositionScans.set(key, Number(d.scans))
    locations.set(key, {
      key,
      system: d.system,
      gravity_well: d.gravity_well,
      region: d.region,
      scans: Number(d.location_scans ?? d.scans),
    })
  }

  const cells = []
  for (const r of data) {
    const key = locationKey(r)
    const denom = compositionScans.get(key)
    if (!denom) continue
    cells.push({
      key,
      system: r.system,
      gravity_well: r.gravity_well,
      region: r.region,
      material: r.material,
      share: Math.round((Number(r.weighted) / denom) * 100) / 100,
      presence: Math.round((Number(r.material_scans) / denom) * 10000) / 100,
      materialScans: Number(r.material_scans),
      rocks: denom, // rocks scanned at the location (the denominator of share)
      // Time between clusters of the deposits holding the material, weighted by the gaps each is based on
      gap: Number(r.gap_n) > 0 ? { avg: Number(r.gap_sum) / Number(r.gap_n), n: Number(r.gap_n) } : null,
    })
  }
  return { locations, cells }
}

/** Orders card rows by concentration, or by time between clusters (shortest first, unknown last). */
export function sortByMetric(items, metric, name) {
  const gap = (i) => i.gap?.avg ?? Infinity
  return [...items].sort(
    (a, b) =>
      (metric === 'gap' && gap(a) !== gap(b) ? gap(a) - gap(b) : 0) ||
      b.share - a.share ||
      name(a).localeCompare(name(b)),
  )
}

/** The figure a card row shows. */
export function metricText(item, metric) {
  return metric === 'gap' ? formatGap(item.gap?.avg ?? null) : `${formatCell(item.share)}%`
}

/** Bar length in percent per row; time between clusters is scaled to the longest in `items`. */
export function barScale(items, metric) {
  if (metric !== 'gap') return (i) => Math.min(100, i.share)
  const max = Math.max(0, ...items.map((i) => i.gap?.avg ?? 0))
  return (i) => (i.gap && max ? (i.gap.avg / max) * 100 : 0)
}
