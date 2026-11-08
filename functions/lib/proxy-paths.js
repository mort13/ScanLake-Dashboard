/**
 * The only Gateway paths the Dashboard proxy forwards.
 *
 * The proxy holds an API key that can read both buckets, so it must not pass
 * arbitrary paths through: the raw bucket (/api/files) holds user and session
 * IDs and opt-in ship positions. The app reads only the derived files below
 * (see src/stores/db.js). Anything else is a 404 that never reaches the Gateway.
 *
 * Positions are opt-in and never served here: consolidated/positions.parquet
 * and monthly/ stay out of this list on purpose.
 *
 * The patterns run on the raw, still percent-encoded URL pathname. Their
 * character classes have no '%', so encoded slashes or dots (%2F, %2E) and any
 * other escape fail to match. URL parsing has already resolved '..' and '.'
 * segments; a path that resolves outside derived/ fails to match as well.
 */
const ALLOWED_PATHS = [
  /^\/api\/derived\/manifest\.json$/,
  /^\/api\/derived\/consolidated\/(?:scans|compositions)\.parquet$/,
  /^\/api\/derived\/results\/[a-z0-9_]+\.parquet$/,
]

/** True if `pathname` (URL#pathname, e.g. "/api/derived/manifest.json") may be proxied. */
export function isAllowedPath(pathname) {
  return typeof pathname === 'string' && ALLOWED_PATHS.some((re) => re.test(pathname))
}
