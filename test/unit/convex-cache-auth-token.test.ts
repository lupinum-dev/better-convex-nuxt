import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchAuthToken } from '../../src/runtime/utils/convex-cache'

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
})
