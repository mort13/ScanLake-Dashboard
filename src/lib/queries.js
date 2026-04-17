/**
 * Built-in SQL query factory.
 * @param {string} key    - Query identifier
 * @param {string} where  - WHERE fragment (no leading AND/WHERE)
 * @param {Object} ae     - Alias expressions: SQL CASE WHEN strings keyed by dimension.
 *                          Keys: deposit, material, user_name, location.
 *                          Supply via aliasesStore.buildCaseExpr(). Defaults to raw columns.
 */

const INERT = `('inert_materials','none','Inert Materials','inert')`

export function getBuiltinSQL(key, where, ae = {}) {
  const w = where && where !== '1=1' ? `AND (${where})` : ''
  const wScan = where && where !== '1=1' ? `WHERE ${where}` : ''

  // Alias expressions — fall back to raw column references when not provided
  const aDeposit  = ae.deposit   || 's.deposit'
  const aMaterial = ae.material  || 'c.type'
  const aUser     = ae.user_name || 's.user_name'
  const aLocation = ae.location  || 's.gravity_well'

  switch (key) {
    case 'db_stats':
      return `
        SELECT
          COUNT(DISTINCT s.capture_id)             AS total_scans,
          COUNT(DISTINCT s.user_id)                AS total_users,
          COUNT(DISTINCT s.gravity_well)           AS gravity_wells,
          COUNT(DISTINCT s.system)                 AS systems,
          COUNT(DISTINCT s.region)                 AS regions,
          COUNT(DISTINCT s.deposit)                AS deposit_types,
          COUNT(DISTINCT c.type)                   AS material_types
        FROM scans s
        LEFT JOIN compositions c ON s.capture_id = c.capture_id
        WHERE c.type NOT IN ${INERT} OR c.type IS NULL
      `

    case 'scans_per_gravity_well':
      return `
        SELECT (${aLocation}) AS gravity_well, COUNT(DISTINCT s.capture_id) AS scan_count
        FROM scans s
        JOIN compositions c ON s.capture_id = c.capture_id
        WHERE c.type NOT IN ${INERT} ${w}
        GROUP BY gravity_well
        ORDER BY scan_count DESC
      `

    case 'scans_per_user':
      return `
        SELECT (${aUser}) AS user_name, COUNT(DISTINCT s.capture_id) AS scan_count
        FROM scans s
        LEFT JOIN compositions c ON s.capture_id = c.capture_id
        WHERE (c.type NOT IN ${INERT} OR c.type IS NULL) ${w}
        GROUP BY user_name
        ORDER BY scan_count DESC
      `

    case 'unique_combos_per_user':
      return `
        SELECT (${aUser}) AS user_name,
               COUNT(DISTINCT s.system || '|' || s.gravity_well || '|' || s.region) AS unique_locations
        FROM scans s
        LEFT JOIN compositions c ON s.capture_id = c.capture_id
        WHERE (c.type NOT IN ${INERT} OR c.type IS NULL) ${w}
        GROUP BY user_name
        ORDER BY unique_locations DESC
      `

    case 'quality_bins_count':
      return `
        SELECT CAST(FLOOR(c.quality / 10) * 10 AS INTEGER) AS quality_bin,
               COUNT(*) AS count
        FROM compositions c
        JOIN scans s ON s.capture_id = c.capture_id
        WHERE c.type NOT IN ${INERT} ${w}
        GROUP BY quality_bin
        ORDER BY quality_bin
      `

    case 'quality_bins_volume':
      return `
        SELECT CAST(FLOOR(c.quality / 10) * 10 AS INTEGER) AS quality_bin,
               ROUND(SUM(s.volume * c.amount / 100.0), 2) AS material_volume
        FROM compositions c
        JOIN scans s ON s.capture_id = c.capture_id
        WHERE c.type NOT IN ${INERT} ${w}
        GROUP BY quality_bin
        ORDER BY quality_bin
      `

    case 'mass_vs_resistance':
      return `
        SELECT s.mass, s.resistance, s.instability,
               (${aDeposit})  AS deposit,
               (${aLocation}) AS gravity_well
        FROM scans s
        LEFT JOIN compositions c ON s.capture_id = c.capture_id
        WHERE (c.type NOT IN ${INERT} OR c.type IS NULL) ${w}
      `

    case 'material_pie':
      return `
        SELECT (${aMaterial}) AS material_type, COUNT(*) AS count
        FROM compositions c
        JOIN scans s ON s.capture_id = c.capture_id
        WHERE c.type NOT IN ${INERT} ${w}
        GROUP BY material_type
        ORDER BY count DESC
      `

    case 'deposit_pie':
      return `
        SELECT (${aDeposit}) AS deposit, COUNT(*) AS count
        FROM scans s
        LEFT JOIN compositions c ON s.capture_id = c.capture_id
        WHERE (c.type NOT IN ${INERT} OR c.type IS NULL) ${w}
        GROUP BY deposit
        ORDER BY count DESC
      `

    default:
      return null
  }
}
