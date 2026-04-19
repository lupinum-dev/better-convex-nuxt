import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  clearsBetterAuthSessionCookie,
  filterBetterAuthCookieHeader,
} from '../../src/runtime/auth/shared/auth-token'
import { fetchAuthToken } from '../../src/runtime/convex/shared/convex-cache'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('fetchAuthToken', () => {
  it('skips token exchange entirely when auth mode is none', async () => {
    const fetchMock = vi.fn(async () => ({ token: 'jwt-should-not-be-used' }))
    vi.stubGlobal('$fetch', fetchMock)

    const token = await fetchAuthToken({
      auth: 'none',
      cookieHeader: 'better-auth.session_token=abc',
      siteUrl: 'https://demo.convex.site',
      cachedToken: { value: null },
    })

    expect(token).toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fetches and caches token in auto auth mode when session cookie exists', async () => {
    const fetchMock = vi.fn(async () => ({ token: 'jwt-from-exchange' }))
    vi.stubGlobal('$fetch', fetchMock)

    const cachedToken = { value: null as string | null }
    const token = await fetchAuthToken({
      auth: 'auto',
      cookieHeader: 'better-auth.session_token=abc',
      siteUrl: 'https://demo.convex.site',
      cachedToken,
    })

    expect(token).toBe('jwt-from-exchange')
    expect(cachedToken.value).toBe('jwt-from-exchange')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('https://demo.convex.site/api/auth/convex/token', {
      headers: { Cookie: 'better-auth.session_token=abc' },
    })
  })

  it('surfaces token exchange failures instead of degrading to anonymous', async () => {
    vi.stubGlobal(
      '$fetch',
      vi.fn(async () => {
        throw new Error('exchange exploded')
      }),
    )

    await expect(
      fetchAuthToken({
        auth: 'auto',
        cookieHeader: 'better-auth.session_token=abc',
        siteUrl: 'https://demo.convex.site',
        cachedToken: { value: null },
      }),
    ).rejects.toThrow('Failed to exchange Convex auth token. exchange exploded')
  })
})

describe('clearsBetterAuthSessionCookie', () => {
  it('detects an empty better-auth session cookie', () => {
    expect(clearsBetterAuthSessionCookie(['better-auth.session_token=; Path=/; HttpOnly'])).toBe(
      true,
    )
  })

  it('detects a secure session cookie cleared via Max-Age=0', () => {
    expect(
      clearsBetterAuthSessionCookie([
        '__Secure-better-auth.session_token=deleted; Max-Age=0; Path=/',
      ]),
    ).toBe(true)
  })

  it('detects a session cookie cleared via epoch expires', () => {
    expect(
      clearsBetterAuthSessionCookie([
        'better-auth.session_token=deleted; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/',
      ]),
    ).toBe(true)
  })

  it('ignores active session cookies', () => {
    expect(
      clearsBetterAuthSessionCookie(['better-auth.session_token=active-token; Path=/; HttpOnly']),
    ).toBe(false)
  })

  it('ignores unrelated cookies', () => {
    expect(clearsBetterAuthSessionCookie(['theme=dark; Path=/', 'session=abc; Path=/'])).toBe(false)
  })
})

describe('filterBetterAuthCookieHeader', () => {
  it('keeps only Better Auth cookies', () => {
    expect(
      filterBetterAuthCookieHeader(
        'theme=dark; better-auth.session_token=abc; __Secure-better-auth.session_token=secure; session=other',
      ),
    ).toBe('better-auth.session_token=abc; __Secure-better-auth.session_token=secure')
  })
})
