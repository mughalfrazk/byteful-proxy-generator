import { describe, expect, it } from 'vitest'

import { ApiErrorSchema } from '@/lib/models/error'
import { LIST_SUCCESS_MESSAGE } from '@/lib/models/residential'

import { POST } from './route'

function post(body: string): Promise<Response> {
  return POST(
    new Request('http://localhost/api/residential/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }),
  )
}

describe('POST /api/residential/list', () => {
  it('returns the list and its count', async () => {
    const response = await post(
      JSON.stringify({
        proxy_user_id: 'user1',
        proxy_user_password: 'secret',
        list_count: 3,
        list_session_type: 'rotating',
      }),
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.count).toBe(3)
    expect(body.data).toHaveLength(3)
  })

  // The spec prescribes `data` and `message` literally. Pinned here so neither
  // can be dropped or renamed without a failing test.
  it('returns the data and message the spec prescribes', async () => {
    const response = await post(
      JSON.stringify({ proxy_user_id: 'u', proxy_user_password: 'p' }),
    )

    const body = await response.json()
    expect(body.message).toBe('Residential list successfully generated.')
    expect(body.message).toBe(LIST_SUCCESS_MESSAGE)
    expect(Array.isArray(body.data)).toBe(true)
  })

  it('never caches, because the body carries a password', async () => {
    const response = await post(
      JSON.stringify({ proxy_user_id: 'u', proxy_user_password: 'p' }),
    )

    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('returns invalid_json for a malformed body', async () => {
    const response = await post('{ not json')

    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe('invalid_json')
  })

  // One oversized user ID times `list_count: 1000` used to build gigabytes of
  // strings and crash the process.
  it('returns payload_too_large for a body over 16 KB', async () => {
    const response = await post(
      JSON.stringify({
        proxy_user_id: 'a'.repeat(20 * 1024),
        proxy_user_password: 'p',
        list_count: 1000,
      }),
    )

    expect(response.status).toBe(413)
    expect((await response.json()).error).toBe('payload_too_large')
  })

  it.each([
    ['a missing password', { proxy_user_id: 'user1' }],
    ['an out-of-range count', { ...{ proxy_user_id: 'u', proxy_user_password: 'p' }, list_count: 0 }],
    ['a bad enum', { proxy_user_id: 'u', proxy_user_password: 'p', list_format: 'ftp' }],
    ['a city without a country', { proxy_user_id: 'u', proxy_user_password: 'p', city_alias: 'london' }],
    ['an unknown key', { proxy_user_id: 'u', proxy_user_password: 'p', country: 'gb' }],
  ])('returns invalid_parameter for %s', async (_label, body) => {
    const response = await post(JSON.stringify(body))

    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe('invalid_parameter')
  })

  it('uses the same { error, message } shape for every failure', async () => {
    const bodies = ['{ not json', JSON.stringify({ proxy_user_id: '' })]

    for (const body of bodies) {
      const parsed = ApiErrorSchema.safeParse(await (await post(body)).json())
      expect(parsed.success).toBe(true)
      expect(parsed.data?.message.length).toBeGreaterThan(0)
    }
  })
})
