import { describe, expect, it, vi } from 'vitest'

import {
  effectiveAuthCacheTtlSeconds,
  isAuthTokenUsable,
} from '../../src/runtime/server/utils/auth-cache'

function jwt(exp: number): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none' })}.${encode({ exp })}.signature`
}

describe('server auth cache policy', () => {
  it('rejects a cached JWT at or after its expiry', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const now = Math.floor(Date.now() / 1000)

    expect(isAuthTokenUsable(jwt(now - 1))).toBe(false)
    expect(isAuthTokenUsable(jwt(now))).toBe(false)
    expect(isAuthTokenUsable(jwt(now + 1))).toBe(true)
    vi.useRealTimers()
  })

  it('bounds storage TTL by the JWT lifetime', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const now = Math.floor(Date.now() / 1000)

    expect(effectiveAuthCacheTtlSeconds(jwt(now + 30), 300)).toBe(30)
    expect(effectiveAuthCacheTtlSeconds(jwt(now + 300), 30)).toBe(30)
    expect(effectiveAuthCacheTtlSeconds(jwt(now - 1), 300)).toBeLessThanOrEqual(0)
    vi.useRealTimers()
  })
})
