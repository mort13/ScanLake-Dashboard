/**
 * Cloudflare Pages Function — server-side proxy for the ScanLake Gateway.
 *
 * The GATEWAY_API_KEY is stored as a Cloudflare Pages secret and is NEVER
 * exposed to the browser. All /api/* requests from the Vue app are forwarded
 * here, the key is injected, then the response is streamed back.
 *
 * Environment variables (set in CF Pages dashboard or wrangler.toml [vars]):
 *   GATEWAY_API_KEY  — sk_... secret key
 *   GATEWAY_URL      — defaults to https://gateway.scanlake.rocks
 */

const GATEWAY_BASE = 'https://gateway.scanlake.rocks';

export async function onRequest(context) {
  const { request, env, params } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  if (request.method !== 'GET') {
    return jsonError(405, 'Method not allowed');
  }

  const apiKey = env.GATEWAY_API_KEY;
  if (!apiKey) {
    console.error('[proxy] GATEWAY_API_KEY is not configured');
    return jsonError(503, 'Gateway not configured');
  }

  // params.path is an array like ['files'] or ['files', 'scans/2026/...']
  const pathSegments = params.path ?? [];
  const upstreamPath = pathSegments.join('/');

  const url = new URL(request.url);
  const upstreamUrl = `${GATEWAY_BASE}/api/${upstreamPath}${url.search}`;

  // Forward only safe headers; strip cookies and auth
  const upstreamHeaders = new Headers();
  upstreamHeaders.set('X-API-Key', apiKey);

  const rangeHeader = request.headers.get('Range');
  if (rangeHeader) {
    upstreamHeaders.set('Range', rangeHeader);
  }

  let upstreamResponse;
  try {
    upstreamResponse = await fetch(upstreamUrl, {
      method: 'GET',
      headers: upstreamHeaders,
    });
  } catch (err) {
    console.error('[proxy] Upstream fetch failed:', err);
    return jsonError(502, 'Upstream fetch failed');
  }

  // Build response headers — pass through content-type, content-length, etag etc.
  const responseHeaders = new Headers();
  for (const key of ['content-type', 'content-length', 'etag', 'last-modified',
                      'content-disposition', 'content-range', 'accept-ranges']) {
    const val = upstreamResponse.headers.get(key);
    if (val) responseHeaders.set(key, val);
  }

  // Add CORS so the browser (same CF Pages domain) can access the proxied resources.
  for (const [k, v] of Object.entries(corsHeaders())) {
    responseHeaders.set(k, v);
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: responseHeaders,
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Disposition, ETag, Content-Range',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonError(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}
