/**
 * Gateway API keys: calls to ScanLake Auth (which issues the keys) and the
 * formatting the /API and /ADMIN tabs share. No Vue or Vite imports, so the
 * node tests can load it.
 */

export const GATEWAY_BASE = 'https://gateway.scanlake.rocks'

/**
 * What a user key may read. Mirrors the Gateway's allowlist (src/lib/publicDerived.ts
 * there) and functions/lib/proxy-paths.js here.
 */
export const PUBLIC_FILES = [
  { path: '/api/derived/manifest.json', what: 'Every file below with its rows, bytes and sha256. Read it first: a file only changes when its sha256 does.' },
  { path: '/api/derived/consolidated/scans.parquet', what: 'All scans, merged and deduplicated, one row per scan.' },
  { path: '/api/derived/consolidated/compositions.parquet', what: 'The materials of every scan.' },
  { path: '/api/derived/results/<name>.parquet', what: 'Refinery results, e.g. location_stats, deposit_materials, highscores. The manifest lists them all.' },
  { path: '/api/derived', what: 'JSON list of the files you can read.' },
]

/**
 * Calls ScanLake Auth with the shared login cookie. Returns the parsed JSON body
 * (null for 204) or throws an Error carrying the server's message and `status`.
 */
export async function authRequest(base, path, { method = 'GET', body, fetchImpl = globalThis.fetch } = {}) {
  const init = { method, credentials: 'include' }
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' }
    init.body = JSON.stringify(body)
  }
  const res = await fetchImpl(`${base}${path}`, init)
  if (res.status === 204) return null
  let data = null
  try {
    data = await res.json()
  } catch {
    // Not JSON (e.g. a proxy error page): fall back to the status
  }
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (HTTP ${res.status})`)
    err.status = res.status
    throw err
  }
  return data
}

const COUNT = new Intl.NumberFormat('en-US')

export function formatCount(n) {
  return COUNT.format(Math.round(n ?? 0))
}

export function formatBytes(n) {
  const value = n ?? 0
  if (value < 1024) return `${Math.round(value)} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = value / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`
}

/** Unix seconds as YYYY-MM-DD (UTC). */
export function formatDate(unixS) {
  return unixS ? new Date(unixS * 1000).toISOString().slice(0, 10) : '–'
}

/** Unix seconds as "3 h ago" etc.; dates beyond two weeks. */
export function formatAgo(unixS, nowMs = Date.now()) {
  if (!unixS) return 'never'
  const s = Math.max(0, Math.floor(nowMs / 1000) - unixS)
  if (s < 3600) return 'this hour'
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`
  if (s < 14 * 86_400) return `${Math.floor(s / 86_400)} d ago`
  return formatDate(unixS)
}

/** "Name (@username)", or the username alone when Discord has no display name. */
export function discordLabel(globalName, username) {
  return globalName && globalName !== username ? `${globalName} (@${username})` : `@${username}`
}

/**
 * Splits the admin key list into at most `top` keys with the most requests in 30
 * days plus one "other" row, for the daily usage chart. The chosen keys keep the
 * order they were created in, so a key's colour doesn't change when another key
 * overtakes it.
 */
export function usageSeries(keys, dayCount, top = 5) {
  const used = keys.filter((k) => k.usage && k.usage.requests30d > 0)
  const chosen = [...used]
    .sort((a, b) => b.usage.requests30d - a.usage.requests30d)
    .slice(0, top)
  const chosenIds = new Set(chosen.map((k) => k.id))
  chosen.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))

  const series = chosen.map((k) => ({
    id: k.id,
    name: k.label ? `${k.label} · ${k.prefix}` : k.prefix,
    counts: k.usage.daily.slice(0, dayCount),
  }))
  const rest = used.filter((k) => !chosenIds.has(k.id))
  if (rest.length > 0) {
    const counts = new Array(dayCount).fill(0)
    for (const k of rest) k.usage.daily.forEach((n, i) => { if (i < dayCount) counts[i] += n })
    series.push({ id: 'other', name: `${rest.length} other key${rest.length === 1 ? '' : 's'}`, counts })
  }
  return series
}
