/**
 * OWASP A02: Cryptographic Failures
 */
import { describe, expect, it } from 'vitest'

import {
  decodeJwtPayload,
  decodeUserFromJwt,
  getJwtTimeUntilExpiryMs,
} from '../../../src/runtime/utils/convex-shared'

function mintJwt(payload: Record<string, unknown>): string {
  const base64Url = (value: string) =>
    Buffer.from(value, 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '')

  return [
    base64Url(JSON.stringify({ alg: 'none', typ: 'JWT' })),
    base64Url(JSON.stringify(payload)),
    'test-signature',
  ].join('.')
}

describe('OWASP A02: Cryptographic Failures', () => {
  it('returns null for malformed JWT strings and broken JSON payloads', () => {
    expect(decodeJwtPayload('not-a-jwt')).toBeNull()
    expect(decodeJwtPayload('a.b')).toBeNull()

    const brokenJson = Buffer.from('this is not json', 'utf8').toString('base64url')
    expect(decodeJwtPayload(`header.${brokenJson}.sig`)).toBeNull()
  })

  it('keeps expiry math finite and rejects invalid exp values', () => {
    expect(getJwtTimeUntilExpiryMs(mintJwt({ sub: 'user-1', exp: Number.NaN }))).toBeNull()
    expect(getJwtTimeUntilExpiryMs(mintJwt({ sub: 'user-1', exp: Number.POSITIVE_INFINITY })))
      .toBeNull()
  })

  it('returns a user only when the JWT carries a usable identifier', () => {
    const bySub = decodeUserFromJwt(mintJwt({ sub: 'user-1', name: 'Alice' }))
    const byUserId = decodeUserFromJwt(mintJwt({ userId: 'user-2', email: 'bob@test.com' }))
    const emailOnly = decodeUserFromJwt(mintJwt({ email: 'carol@test.com' }))

    expect(bySub?.id).toBe('user-1')
    expect(byUserId?.id).toBe('user-2')
    expect(emailOnly).toBeNull()
  })
})
