import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  authRequest,
  discordLabel,
  formatAgo,
  formatBytes,
  formatCount,
  formatDate,
  usageSeries,
} from '../src/lib/apiKeys.js'

function fakeFetch(status, body) {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    return {
      status,
      ok: status >= 200 && status < 300,
      json: async () => {
        if (body === undefined) throw new SyntaxError('no json')
        return body
      },
    }
  }
  return { fetchImpl, calls }
}

describe('authRequest', () => {
  test('sends the cookie and a JSON body', async () => {
    const { fetchImpl, calls } = fakeFetch(201, { token: 'slk_x' })
    const data = await authRequest('https://auth.example', '/api/me/api-keys', {
      method: 'POST',
      body: { label: 'tool' },
      fetchImpl,
    })
    assert.deepEqual(data, { token: 'slk_x' })
    assert.equal(calls[0].url, 'https://auth.example/api/me/api-keys')
    assert.equal(calls[0].init.credentials, 'include')
    assert.equal(calls[0].init.method, 'POST')
    assert.equal(calls[0].init.body, '{"label":"tool"}')
    assert.equal(calls[0].init.headers['Content-Type'], 'application/json')
  })

  test('GET and a POST without body send no Content-Type', async () => {
    const { fetchImpl, calls } = fakeFetch(204)
    assert.equal(await authRequest('https://a', '/x', { method: 'POST', fetchImpl }), null)
    assert.equal(calls[0].init.headers, undefined)
    assert.equal(calls[0].init.body, undefined)
  })

  test("throws the server's error message with the status", async () => {
    const { fetchImpl } = fakeFetch(409, { error: 'You already have 2 active keys. Revoke one first.' })
    await assert.rejects(authRequest('https://a', '/x', { fetchImpl }), (err) => {
      assert.equal(err.message, 'You already have 2 active keys. Revoke one first.')
      assert.equal(err.status, 409)
      return true
    })
  })

  test('falls back to the status when the body is not JSON', async () => {
    const { fetchImpl } = fakeFetch(502)
    await assert.rejects(authRequest('https://a', '/x', { fetchImpl }), /HTTP 502/)
  })
})

describe('formatting', () => {
  test('counts and bytes', () => {
    assert.equal(formatCount(20000), '20,000')
    assert.equal(formatCount(undefined), '0')
    assert.equal(formatBytes(512), '512 B')
    assert.equal(formatBytes(1536), '1.5 KB')
    assert.equal(formatBytes(25 * 1024 * 1024), '25 MB')
  })

  test('dates and ages', () => {
    const now = Date.parse('2026-11-23T12:00:00Z')
    const s = (iso) => Date.parse(iso) / 1000
    assert.equal(formatDate(s('2026-11-03T05:00:00Z')), '2026-11-03')
    assert.equal(formatDate(null), '–')
    assert.equal(formatAgo(null, now), 'never')
    assert.equal(formatAgo(s('2026-11-23T11:30:00Z'), now), 'this hour')
    assert.equal(formatAgo(s('2026-11-23T07:00:00Z'), now), '5 h ago')
    assert.equal(formatAgo(s('2026-11-20T12:00:00Z'), now), '3 d ago')
    assert.equal(formatAgo(s('2026-10-01T12:00:00Z'), now), '2026-10-01')
  })

  test('Discord names', () => {
    assert.equal(discordLabel('Rock Miner', 'miner'), 'Rock Miner (@miner)')
    assert.equal(discordLabel(null, 'miner'), '@miner')
    assert.equal(discordLabel('miner', 'miner'), '@miner')
  })
})

describe('usageSeries', () => {
  const key = (id, createdAt, daily, label = '') => ({
    id,
    prefix: `slk_${id}`,
    label,
    createdAt,
    usage: { requests30d: daily.reduce((a, b) => a + b, 0), daily },
  })

  test('keeps the busiest keys in creation order and sums the rest', () => {
    const keys = [
      key('a', 1, [1, 0, 0]),
      key('b', 2, [50, 50, 0], 'big'),
      key('c', 3, [0, 0, 10]),
      key('d', 4, [0, 2, 0]),
      { id: 'e', prefix: 'slk_e', label: '', createdAt: 5, usage: null },
      key('f', 6, [0, 0, 0]),
    ]
    const series = usageSeries(keys, 3, 2)
    assert.deepEqual(
      series.map((s) => [s.id, s.name, s.counts]),
      [
        ['b', 'big · slk_b', [50, 50, 0]],
        ['c', 'slk_c', [0, 0, 10]],
        ['other', '2 other keys', [1, 2, 0]],
      ],
    )
  })

  test('no other row when everything fits', () => {
    assert.deepEqual(usageSeries([key('a', 1, [3])], 1).map((s) => s.id), ['a'])
    assert.deepEqual(usageSeries([], 30), [])
  })
})
