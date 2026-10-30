/** Reads of results_deposit_materials_by_region shared by the Locations and Materials tabs. */

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
 * @returns {{
 *   locations: Map<string, {key, system, gravity_well, region, scans: number}>,
 *   cells: {key, system, gravity_well, region, material, share: number, presence: number, materialScans: number}[],
 * }}
 *   `cells` has one entry per location x material; `scans` of a location is its total scan count.
 */
export async function loadRegionConcentrations(db, results, columns) {
  const table = `"results_${REGION_TABLE}"`
  const where = results.buildWhere(columns)
  const whereAll = results.buildWhere(columns, ['material'])
  const loc = 'system, gravity_well, region'
  const [data, denoms] = await Promise.all([
    db.runQuery(
      `SELECT ${loc}, material, sum(avg_share_pct * composition_scans) AS weighted,
              sum(material_scans) AS material_scans
       FROM ${table} WHERE material IS NOT NULL AND ${where} GROUP BY ${loc}, material`,
    ),
    db.runQuery(
      `SELECT ${loc}, sum(scans) AS scans, max(location_scans) AS location_scans FROM (
         SELECT ${loc}, deposit, max(composition_scans) AS scans, max(location_scans) AS location_scans
         FROM ${table} WHERE ${whereAll} GROUP BY ${loc}, deposit
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
    })
  }
  return { locations, cells }
}
