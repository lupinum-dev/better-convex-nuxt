import { describe, expect, it } from 'vitest'

import { decodeUserFromJwt } from '../../src/runtime/utils/convex-shared'

function toBase64Url(value: string): string {
  return Buffer.from(value, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function makeJwt(payload: Record<string, unknown>): string {
  const header = toBase64Url(JSON.stringify({ alg: 'none', typ: 'JWT' }))
  const body = toBase64Url(JSON.stringify(payload))
  return `${header}.${body}.signature`
}

describe('decodeUserFromJwt', () => {
  it('decodes standard user fields', () => {
    const token = makeJwt({
      sub: 'user_123',
      name: 'Ada',
      email: 'ada@example.com',
      emailVerified: true,
      image: 'https://example.com/avatar.png',
    })

    expect(decodeUserFromJwt(token)).toEqual({
      id: 'user_123',
      name: 'Ada',
      email: 'ada@example.com',
      emailVerified: true,
      image: 'https://example.com/avatar.png',
    })
  })

  it('preserves custom claims for augmented ConvexUser consumers', () => {
    const token = makeJwt({
      sub: 'user_123',
      name: 'Ada',
      email: 'ada@example.com',
      role: 'admin',
      organizationId: 'org_1',
      flags: ['beta'],
      profile: { theme: 'dark' },
      iat: 1234567890,
      exp: 1234567999,
    })

    expect(decodeUserFromJwt(token)).toEqual({
      id: 'user_123',
      name: 'Ada',
      email: 'ada@example.com',
      role: 'admin',
      organizationId: 'org_1',
      flags: ['beta'],
      profile: { theme: 'dark' },
    })
  })
})
