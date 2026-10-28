import { describe, expect, it } from 'vitest'

import { ListRequestSchema } from './residential'

const valid = {
  proxy_user_id: 'user1',
  proxy_user_password: 'secret',
}

function parse(overrides: Record<string, unknown> = {}) {
  return ListRequestSchema.safeParse({ ...valid, ...overrides })
}

function messages(result: ReturnType<typeof parse>): string[] {
  return result.success ? [] : result.error.issues.map((issue) => issue.message)
}

describe('ListRequestSchema defaults', () => {
  it('fills in the spec defaults', () => {
    const result = parse()

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      list_count: 100,
      list_format: 'http',
      list_session_type: 'sticky',
    })
  })
})

describe('list_count', () => {
  it.each([
    [1, true],
    [1000, true],
    [100, true],
  ])('accepts %s', (list_count, ok) => {
    expect(parse({ list_count }).success).toBe(ok)
  })

  it.each([0, 1001, -1])('rejects %s', (list_count) => {
    expect(parse({ list_count }).success).toBe(false)
  })

  it('rejects a numeric string, so the form must send a real number', () => {
    expect(parse({ list_count: '10' }).success).toBe(false)
  })

  it('rejects a decimal', () => {
    expect(messages(parse({ list_count: 10.5 }))).toContain(
      'must be a whole number, not a decimal',
    )
  })
})

describe('enums', () => {
  it('rejects an unknown format', () => {
    expect(parse({ list_format: 'ftp' }).success).toBe(false)
  })

  it('rejects an unknown session type', () => {
    expect(parse({ list_session_type: 'semi-sticky' }).success).toBe(false)
  })
})

describe('country_id', () => {
  it('normalises "US" to "us"', () => {
    const result = parse({ country_id: 'US' })

    expect(result.success).toBe(true)
    expect(result.data?.country_id).toBe('us')
  })

  it('trims surrounding whitespace', () => {
    expect(parse({ country_id: ' gb ' }).data?.country_id).toBe('gb')
  })

  it('rejects a three-letter code', () => {
    expect(parse({ country_id: 'usa' }).success).toBe(false)
  })
})

describe('cross-field rules', () => {
  it('rejects city_alias without country_id', () => {
    const result = parse({ city_alias: 'london' })

    expect(result.success).toBe(false)
    expect(messages(result)).toContain('requires country_id')
  })

  it('accepts city_alias with country_id', () => {
    expect(parse({ country_id: 'gb', city_alias: 'london' }).success).toBe(true)
  })

  // Real aliases from the city search, including ones that contain what looks
  // like a username segment.
  it.each(['london', 'ca_on_london', 've_s_colon', 'ar_c_bella_vista'])(
    'accepts the real city_alias %j',
    (city_alias) => {
      expect(parse({ country_id: 'gb', city_alias }).success).toBe(true)
    },
  )

  it.each(['x_s_FIXEDSESSION00', 'x:y@evil.com:80/', 'London', 'new york', ''])(
    'rejects %j as a city_alias, since it is not an alias shape',
    (city_alias) => {
      expect(parse({ country_id: 'gb', city_alias }).success).toBe(false)
    },
  )

  it('accepts asn_id on its own, since ASN needs no country', () => {
    expect(parse({ asn_id: 5089 }).success).toBe(true)
  })
})

describe('strictness and required fields', () => {
  it('rejects an unknown key rather than ignoring it', () => {
    const result = parse({ country: 'gb' })

    expect(result.success).toBe(false)
    expect(messages(result).join(' ')).toContain('country')
  })

  it('rejects an empty user id', () => {
    const result = parse({ proxy_user_id: '' })

    expect(result.success).toBe(false)
    expect(messages(result)).toEqual(['is required'])
  })

  it('rejects an empty password', () => {
    expect(parse({ proxy_user_password: '' }).success).toBe(false)
  })

  it('accepts alphanumeric credentials', () => {
    expect(
      parse({ proxy_user_id: 'User1', proxy_user_password: 'Secret42' }).success,
    ).toBe(true)
  })

  // Anything else could break the proxy URL (`@`, `:`, `/`) or the username.
  it.each(['p@ss', 'a:b', 'a/b', 'a#b', 'a b', ' alice', 'a_b', 'pässe'])(
    'rejects %j as a user id or password',
    (value) => {
      expect(parse({ proxy_user_id: value }).success).toBe(false)
      expect(parse({ proxy_user_password: value }).success).toBe(false)
    },
  )
})
