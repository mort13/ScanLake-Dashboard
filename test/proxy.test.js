import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import { isAllowedPath } from '../functions/lib/proxy-paths.js'
import { onRequest } from '../functions/api/[[path]].js'

const ORIGIN = 'https://dashboard.example'

/** Pathname as the Worker sees it: after URL parsing (dot segments resolved, '\' → '/'). */
const pathOf = (path) => new URL(ORIGIN + path).pathname

const ALLOWED = [
  '/api/derived/manifest.json',
  '/api/derived/consolidated/scans.parquet',
  '/api/derived/consolidated/compositions.parquet',
  '/api/derived/results/deposit_materials_by_region.parquet',
  '/api/derived/results/material_entries_by_region.parquet',
  '/api/derived/results/highscores.parquet',
]

const REJECTED = [
  // Nothing outside the allowlist
  '/api',
  '/api/',
  '/api/files',
  '/api/files/',
  '/api/files/2026/11/07/user/session/positions_batch001.parquet',
  '/api/format',
  '/api/me',
  '/api/derived',
  '/api/derived/',
  '/api/derived/consolidated/',
  '/api/derived/results/',
  // Ship positions stay out
  '/api/derived/consolidated/positions.parquet',
  '/api/derived/monthly/2026-11/positions.parquet',
  '/api/derived/monthly/2026-11/scans.parquet',
  '/api/derived/results/positions', // no .parquet
  // Encoded slashes, dots and other escapes
  '/api/derived/consolidated%2Fpositions.parquet',
  '/api/derived/consolidated%2fscans.parquet',
  '/api/derived/results/..%2Fconsolidated%2Fpositions.parquet',
  '/api/derived/results/%2E%2E%2F%2E%2E%2Ffiles',
  '/api/derived/manifest%2Ejson',
  '/api/derived/consolidated/scans.parquet%00',
  '/api/derived/results/high%73cores.parquet',
  '/api/%64erived/manifest.json',
  // Dot segments that resolve outside derived/
  '/api/derived/../files',
  '/api/derived/../files/2026/11/07/user/session/positions_batch001.parquet',
  '/api/derived/results/../../files',
  '/api/derived/results/%2e%2e/%2e%2e/files',
  '/api/derived/results/../consolidated/positions.parquet',
  '/api/derived\\..\\files',
  // Near misses
  '/api/derived//manifest.json',
  '/api/derived/manifest.json/',
  '/api/derived/Manifest.json',
  '/api/derived/manifest.json;x',
  '/api/derived/consolidated/scans.parquet/x',
  '/api/derived/consolidated/scans.parquetx',
  '/api/derived/consolidated/Scans.parquet',
  '/api/derived/results/.parquet',
  '/api/derived/results/HighScores.parquet',
  '/api/derived/results/high-scores.parquet',
  '/api/derived/results/a.b.parquet',
  '/api/derived/results/sub/highscores.parquet',
  '/api/derived/results/highscores.parquet.json',
  '//api/derived/manifest.json',
]

describe('isAllowedPath', () => {
  for (const path of ALLOWED) {
    test(`allows ${path}`, () => {
      assert.equal(isAllowedPath(path), true)
      assert.equal(isAllowedPath(pathOf(path)), true)
    })
  }

  for (const path of REJECTED) {
    test(`rejects ${path}`, () => {
      assert.equal(isAllowedPath(pathOf(path)), false, `parsed: ${pathOf(path)}`)
    })
  }

  test('rejects the raw, unparsed forms too', () => {
    for (const path of REJECTED) assert.equal(isAllowedPath(path), false, path)
  })

  test('rejects non-strings', () => {
    for (const v of [undefined, null, 1, {}, ['/api/derived/manifest.json']]) {
      assert.equal(isAllowedPath(v), false)
    }
  })

  test('dot segments that resolve inside the allowlist are the same file', () => {
    // URL parsing turns this into /api/derived/consolidated/scans.parquet
    assert.equal(pathOf('/api/derived/results/%2e%2e/consolidated/scans.parquet'),
      '/api/derived/consolidated/scans.parquet')
  })
})

describe('onRequest', () => {
  const realFetch = globalThis.fetch
  let calls

  beforeEach(() => {
    calls = []
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), init })
      return new Response('PAR1', {
        status: 206,
        headers: {
          'content-type': 'application/octet-stream',
          'content-range': 'bytes 0-3/100',
          'set-cookie': 'leak=1',
        },
      })
    }
  })

  afterEach(() => {
    globalThis.fetch = realFetch
  })

  const call = (path, { method = 'GET', headers = {}, env = { GATEWAY_API_KEY: 'sk_test' } } = {}) =>
    onRequest({ request: new Request(ORIGIN + path, { method, headers }), env, params: {} })

  test('forwards an allowed GET with the key and the Range header', async () => {
    const res = await call('/api/derived/consolidated/scans.parquet', {
      headers: { Range: 'bytes=0-3', Cookie: 'sl_session=abc', Authorization: 'Bearer x' },
    })
    assert.equal(res.status, 206)
    assert.equal(await res.text(), 'PAR1')
    assert.equal(res.headers.get('content-range'), 'bytes 0-3/100')
    assert.equal(res.headers.get('set-cookie'), null)

    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'https://gateway.scanlake.rocks/api/derived/consolidated/scans.parquet')
    const sent = calls[0].init.headers
    assert.equal(sent.get('X-API-Key'), 'sk_test')
    assert.equal(sent.get('Range'), 'bytes=0-3')
    assert.equal(sent.get('Cookie'), null)
    assert.equal(sent.get('Authorization'), null)
  })

  test('drops the query string', async () => {
    await call('/api/derived/manifest.json?prefix=consolidated/&list=1')
    assert.equal(calls[0].url, 'https://gateway.scanlake.rocks/api/derived/manifest.json')
  })

  test('forwards every allowed path unchanged', async () => {
    for (const path of ALLOWED) await call(path)
    assert.deepEqual(calls.map((c) => c.url), ALLOWED.map((p) => 'https://gateway.scanlake.rocks' + p))
  })

  for (const path of REJECTED) {
    test(`404 without an upstream call for ${path}`, async () => {
      const res = await call(path)
      assert.equal(res.status, 404)
      assert.deepEqual(await res.json(), { error: 'Not found' })
      assert.equal(calls.length, 0)
    })
  }

  test('404 comes before the method and key checks', async () => {
    assert.equal((await call('/api/files', { method: 'POST' })).status, 404)
    assert.equal((await call('/api/files', { method: 'OPTIONS' })).status, 404)
    assert.equal((await call('/api/files', { env: {} })).status, 404)
    assert.equal(calls.length, 0)
  })

  test('only GET (and OPTIONS) on an allowed path', async () => {
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      assert.equal((await call('/api/derived/manifest.json', { method })).status, 405, method)
    }
    assert.equal((await call('/api/derived/manifest.json', { method: 'OPTIONS' })).status, 204)
    assert.equal(calls.length, 0)
  })

  test('503 without a key on an allowed path', async () => {
    const res = await call('/api/derived/manifest.json', { env: {} })
    assert.equal(res.status, 503)
    assert.equal(calls.length, 0)
  })
})
