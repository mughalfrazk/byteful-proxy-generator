import { describe, expect, it } from 'vitest'

import { ListRequestSchema, LIST_FORMATS } from '@/lib/models/residential'

import {
  PROXY_HOST,
  PROXY_PORT,
  buildProxyList,
  buildUsername,
} from './buildProxyList'
import { SESSION_ID_LENGTH } from './sessionId'

/** Builds a validated request, so the tests exercise the real normalisation. */
function request(overrides: Record<string, unknown> = {}) {
  return ListRequestSchema.parse({
    proxy_user_id: 'user1',
    proxy_user_password: 'secret',
    ...overrides,
  })
}

const SESSION_SEGMENT = /_s_([A-Z0-9]{16})$/

function usernameOf(proxy: string): string {
  return proxy.split('://')[1].split(':')[0]
}

describe('buildProxyList', () => {
  it('applies the spec defaults: sticky, 100 lines, http', () => {
    const list = buildProxyList(request())

    expect(list).toHaveLength(100)
    for (const proxy of list) {
      expect(proxy).toMatch(
        new RegExp(
          `^http://user1_s_[A-Z0-9]{16}:secret@${PROXY_HOST}:${PROXY_PORT}$`,
        ),
      )
    }
  })

  it('repeats one identical line for a rotating list', () => {
    const list = buildProxyList(
      request({ list_session_type: 'rotating', list_count: 5 }),
    )

    expect(list).toHaveLength(5)
    expect(new Set(list).size).toBe(1)
    expect(list[0]).toBe(
      `http://user1:secret@${PROXY_HOST}:${PROXY_PORT}`,
    )
  })

  it('gives every sticky line a unique 16-character [A-Z0-9] session id', () => {
    const list = buildProxyList(request({ list_count: 250 }))
    const ids = list.map((proxy) => {
      const match = SESSION_SEGMENT.exec(usernameOf(proxy))
      expect(match).not.toBeNull()
      return match![1]
    })

    expect(ids).toHaveLength(250)
    expect(new Set(ids).size).toBe(250)
    for (const id of ids) {
      expect(id).toHaveLength(SESSION_ID_LENGTH)
      expect(id).toMatch(/^[A-Z0-9]+$/)
    }
  })

  it.each(LIST_FORMATS)('uses %s as the URL scheme', (format) => {
    const [proxy] = buildProxyList(
      request({ list_format: format, list_count: 1 }),
    )

    expect(proxy.startsWith(`${format}://`)).toBe(true)
  })
})

describe('buildUsername targeting', () => {
  it('adds no segments when nothing is targeted', () => {
    expect(buildUsername(request())).toBe('user1')
  })

  it('adds the country segment', () => {
    expect(buildUsername(request({ country_id: 'gb' }))).toBe('user1_c_gb')
  })

  it('adds country then city, in table order', () => {
    expect(
      buildUsername(request({ country_id: 'gb', city_alias: 'london' })),
    ).toBe('user1_c_gb_city_london')
  })

  it('adds the ASN segment on its own', () => {
    expect(buildUsername(request({ asn_id: 5089 }))).toBe('user1_asn_5089')
  })

  it('adds all three segments in table order', () => {
    expect(
      buildUsername(
        request({ country_id: 'gb', city_alias: 'london', asn_id: 5089 }),
      ),
    ).toBe('user1_c_gb_city_london_asn_5089')
  })

  it('appends the session segment last', () => {
    expect(buildUsername(request({ country_id: 'gb' }), 'ABCDEFGH12345678')).toBe(
      'user1_c_gb_s_ABCDEFGH12345678',
    )
  })
})
