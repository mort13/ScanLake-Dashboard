/** Reads of results_deposit_materials_by_region shared by the Locations and Materials tabs. */

import { formatCell, formatGap, formatDistance } from '@/lib/results'

export const REGION_TABLE = 'deposit_materials_by_region'
// Distances between clusters per location x deposit, from the opt-in ship positions
export const DISTANCE_TABLE = 'cluster_distances_by_region'

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
 * Time and distance between clusters are those of the deposits holding the material:
 * each deposit's average weighted by the gaps (time) or clusters (distance) it is
 * based on. A deposit's distance is the average from each of its clusters to the
 * nearest other cluster of the same deposit, from results_cluster_distances_by_region
 * (null when that table isn't published or the deposit has no positions).
 *
 * @param db       the db store
 * @param results  the results store (its filters become the WHERE clause)
 * @param columns  column names of the results table
 * @param options  `byWell`: combine the regions of each gravity well into one location (region is null)
 * @returns {{
 *   locations: Map<string, {key, system, gravity_well, region, scans: number}>,
 *   cells: {key, system, gravity_well, region, material, share: number, presence: number, materialScans: number, rocks: number,
 *           gap: {avg: number, n: number} | null, distance: {avg: number, n: number} | null}[],
 * }}
 *   `cells` has one entry per location x material; `scans` of a location is its total scan count.
 */
export async function loadRegionConcentrations(db, results, columns, { byWell = false } = {}) {
  const table = `"results_${REGION_TABLE}"`
  const where = results.buildWhere(columns)
  const whereAll = results.buildWhere(columns, ['material'])
  const loc = byWell ? 'system, gravity_well' : 'system, gravity_well, region'
  const sel = byWell ? 'system, gravity_well, NULL AS region' : loc
  const [data, denoms, distances] = await Promise.all([
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
    db.resultTables.includes(DISTANCE_TABLE)
      ? db.runQuery(
          `SELECT ${sel}, material, sum(nearest_m * clusters) AS dist_sum, sum(clusters) AS dist_n FROM (
             SELECT m.system, m.gravity_well, m.region, m.material,
                    d.deposit_avg_nearest_cluster_m AS nearest_m, d.deposit_clusters AS clusters
             FROM (SELECT DISTINCT system, gravity_well, region, deposit, material
                   FROM ${table} WHERE material IS NOT NULL AND ${where}) m
             JOIN "results_${DISTANCE_TABLE}" d
               ON d.system = m.system AND d.gravity_well = m.gravity_well
              AND d.region IS NOT DISTINCT FROM m.region AND d.deposit = m.deposit
             WHERE d.deposit_avg_nearest_cluster_m IS NOT NULL
           ) GROUP BY ${loc}, material`,
        )
      : [],
  ])
  const distanceOf = new Map(
    distances.map((r) => [`${locationKey(r)}|${r.material}`, { avg: Number(r.dist_sum) / Number(r.dist_n), n: Number(r.dist_n) }]),
  )

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
      // Distance between clusters of the deposits holding the material, weighted by their clusters
      distance: distanceOf.get(`${key}|${r.material}`) ?? null,
    })
  }
  return { locations, cells }
}

// The card figures other than concentration: a row's {avg, n} and how to show its average
const SPACING = {
  gap: { of: (i) => i.gap, format: formatGap },
  distance: { of: (i) => i.distance, format: formatDistance },
}

/** True if the figure is a spacing between clusters (time or distance) rather than concentration. */
export const isSpacing = (metric) => metric in SPACING

/**
 * Orders card rows by concentration, or by time or distance between clusters
 * (shortest first, unknown last).
 */
export function sortByMetric(items, metric, name) {
  const spacing = SPACING[metric]
  const value = (i) => spacing?.of(i)?.avg ?? Infinity
  return [...items].sort(
    (a, b) =>
      (spacing && value(a) !== value(b) ? value(a) - value(b) : 0) ||
      b.share - a.share ||
      name(a).localeCompare(name(b)),
  )
}

/** The figure a card row shows. */
export function metricText(item, metric) {
  const spacing = SPACING[metric]
  return spacing ? spacing.format(spacing.of(item)?.avg ?? null) : `${formatCell(item.share)}%`
}

/** Bar length in percent per row; time and distance are scaled to the longest in `items`. */
export function barScale(items, metric) {
  const spacing = SPACING[metric]
  if (!spacing) return (i) => Math.min(100, i.share)
  const max = Math.max(0, ...items.map((i) => spacing.of(i)?.avg ?? 0))
  return (i) => (spacing.of(i) && max ? (spacing.of(i).avg / max) * 100 : 0)
}

/**
 * Distances between clusters per location x deposit, for the detail pages:
 * [{ key (locationKey), deposit, avg, median, n (clusters) }] of the deposits with one.
 * `where` narrows the rows (SQL on system, gravity_well, region, deposit). Empty when
 * the table isn't published.
 */
export async function loadDepositDistances(db, where = '1=1') {
  if (!db.resultTables.includes(DISTANCE_TABLE)) return []
  const rows = await db.runQuery(
    `SELECT system, gravity_well, region, deposit, deposit_clusters AS n,
            deposit_avg_nearest_cluster_m AS avg, deposit_median_nearest_cluster_m AS median
     FROM "results_${DISTANCE_TABLE}" WHERE deposit_avg_nearest_cluster_m IS NOT NULL AND ${where}`,
  )
  return rows.map((r) => ({
    key: locationKey(r),
    deposit: r.deposit,
    avg: Number(r.avg),
    median: r.median == null ? null : Number(r.median),
    n: Number(r.n),
  }))
}

/** Several {avg, median, n} as one: the averages weighted by n; medians can't be combined, so one survives only alone. */
export function combineSpacing(list) {
  const items = list.filter((x) => x?.n && x.avg != null)
  const n = items.reduce((s, x) => s + x.n, 0)
  if (!n) return null
  return {
    n,
    avg: items.reduce((s, x) => s + x.avg * x.n, 0) / n,
    median: items.length === 1 ? items[0].median : null,
  }
}

/** The text of a time ('gap') or distance figure: "–" when there is none. */
export const spacingText = (v, metric) => SPACING[metric].format(v?.avg ?? null)

/** Hover text of a detail page's time or distance bar: the median when known and what the average rests on. */
export function spacingDetail(v, metric) {
  if (!v) return metric === 'gap' ? 'No gaps measured' : 'No distances measured'
  const median = v.median != null ? `median ${SPACING[metric].format(v.median)} · ` : ''
  const unit = metric === 'gap' ? (v.n === 1 ? 'gap' : 'gaps') : v.n === 1 ? 'cluster' : 'clusters'
  return `${median}${v.n} ${unit}`
}

/** Hover text of a card row for a spacing figure: what its average is based on. */
export function spacingTitle(item, metric) {
  const v = SPACING[metric].of(item)
  if (metric === 'gap') return v ? `Average over ${v.n} ${v.n === 1 ? 'gap' : 'gaps'}` : 'No gaps measured'
  return v ? `Average over ${v.n} ${v.n === 1 ? 'cluster' : 'clusters'}` : 'No distances measured'
}
