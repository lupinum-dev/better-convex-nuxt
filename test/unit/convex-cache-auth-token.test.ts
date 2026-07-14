import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  ANONYMOUS_IDENTITY,
  identityToken,
  toAuthenticatedIdentity,
  type AuthIdentity,
} from '../../src/runtime/auth/auth-identity'
import { fetchAuthToken } from '../../src/runtime/utils/convex-cache'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// fetchAuthToken performs NO cookie -> JWT exchange. plugin.server.ts
// runs the single per-request exchange before any route component setup and
// writes one canonical useState('convex:identity'); SSR queries receive only its
// direct token projection.
function tokenProjection(identity: AuthIdentity): { value: string | null } {
  return { value: identityToken(identity) }
}

describe('fetchAuthToken', () => {
  it('skips auth entirely when auth mode is none', () => {
    const fetchMock = vi.fn(async () => ({ token: 'jwt-should-not-be-used' }))
    vi.stubGlobal('$fetch', fetchMock)

    const token = fetchAuthToken({
      auth: 'none',
      cookieHeader: 'better-auth.session_token=abc',
      cachedToken: tokenProjection(
        toAuthenticatedIdentity('plugin.resolved.jwt', { id: 'user-1' }),
      ),
    })

    expect(token).toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns the plugin-resolved token when a session cookie is present (no self-exchange)', () => {
    const fetchMock = vi.fn(async () => ({ token: 'jwt-from-exchange' }))
    vi.stubGlobal('$fetch', fetchMock)

    const identity = toAuthenticatedIdentity('plugin.resolved.jwt', { id: 'user-1' })
    const cachedToken = tokenProjection(identity)
    const token = fetchAuthToken({
      auth: 'required',
      cookieHeader: 'private_app_cookie=secret; better-auth.session_token=abc',
      cachedToken,
    })

    // SSR query token === plugin.server token for the same request.
    expect(token).toBe('plugin.resolved.jwt')
    expect(token).toBe(identityToken(identity))
    // Never runs a second exchange even though $fetch is available.
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('recognizes secure Better Auth session cookies', () => {
    const cachedToken = tokenProjection(
      toAuthenticatedIdentity('plugin.resolved.secure.jwt', { id: 'user-1' }),
    )
    const token = fetchAuthToken({
      auth: 'required',
      cookieHeader: 'private_app_cookie=secret; __Secure-better-auth.session_token=secure-abc',
      cachedToken,
    })

    expect(token).toBe('plugin.resolved.secure.jwt')
  })

  it('returns undefined when a session cookie exists but the plugin resolved no token', () => {
    const fetchMock = vi.fn(async () => ({ token: 'jwt-should-not-be-used' }))
    vi.stubGlobal('$fetch', fetchMock)

    const token = fetchAuthToken({
      auth: 'required',
      cookieHeader: 'better-auth.session_token=abc',
      cachedToken: tokenProjection(ANONYMOUS_IDENTITY),
    })

    expect(token).toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns undefined when there is no Better Auth session cookie', () => {
    const token = fetchAuthToken({
      auth: 'required',
      cookieHeader: 'private_app_cookie=secret',
      cachedToken: tokenProjection(toAuthenticatedIdentity('stale.jwt', { id: 'user-1' })),
    })

    expect(token).toBeUndefined()
  })
})
