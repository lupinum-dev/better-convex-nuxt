import { describe, it, expect, vi } from 'vitest'

import {
  fetchWithCanonicalRedirects,
  getCanonicalRedirectTarget,
  normalizePathname,
} from '../../src/runtime/server/api/auth/redirect-utils'

describe('auth proxy canonical redirect handling', () => {
  describe('normalizePathname', () => {
    it('removes trailing slashes while preserving root', () => {
      expect(normalizePathname('/api/auth/sign-up/email/')).toBe('/api/auth/sign-up/email')
      expect(normalizePathname('/')).toBe('/')
    })
  })

  describe('getCanonicalRedirectTarget', () => {
    it('returns redirect target for cross-origin canonical redirect', () => {
      const target = getCanonicalRedirectTarget(
        'https://my-domain.com/api/auth/sign-up/email?foo=bar',
        'https://www.my-domain.com/api/auth/sign-up/email?foo=bar',
      )
      expect(target).toBe('https://www.my-domain.com/api/auth/sign-up/email?foo=bar')
    })

    it('returns null for different path redirects', () => {
      const target = getCanonicalRedirectTarget(
        'https://my-domain.com/api/auth/sign-up/email',
        'https://www.my-domain.com/oauth/authorize',
      )
      expect(target).toBeNull()
    })
  })

  describe('fetchWithCanonicalRedirects', () => {
    it('follows canonical cross-origin redirects internally', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          new Response('', {
            status: 307,
            headers: {
              location: 'https://www.my-domain.com/api/auth/sign-up/email?foo=bar',
            },
          }),
        )
        .mockResolvedValueOnce(new Response('ok', { status: 200 }))

      const response = await fetchWithCanonicalRedirects({
        target: 'https://my-domain.com/api/auth/sign-up/email?foo=bar',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"email":"test@example.com"}',
        fetchImpl: fetchMock,
      })

      expect(response.status).toBe(200)
      expect(fetchMock).toHaveBeenCalledTimes(2)
      const [firstCall, secondCall] = fetchMock.mock.calls
      expect(firstCall).toBeDefined()
      expect(secondCall).toBeDefined()
      if (!firstCall || !secondCall) {
        throw new Error('Expected two fetch calls')
      }
      expect(firstCall[0]).toBe('https://my-domain.com/api/auth/sign-up/email?foo=bar')
      expect(secondCall[0]).toBe('https://www.my-domain.com/api/auth/sign-up/email?foo=bar')
    })

    it('does not follow non-canonical redirects (oauth style)', async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(
        new Response('', {
          status: 302,
          headers: {
            location: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=abc',
          },
        }),
      )

      const response = await fetchWithCanonicalRedirects({
        target: 'https://www.my-domain.com/api/auth/sign-in/social',
        method: 'GET',
        headers: {},
        fetchImpl: fetchMock,
      })

      expect(response.status).toBe(302)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('strips the cookie header on a followed cross-origin canonical redirect (F-27)', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          new Response('', {
            status: 302,
            headers: {
              location: 'https://www.my-domain.com/api/auth/get-session',
            },
          }),
        )
        .mockResolvedValueOnce(new Response('ok', { status: 200 }))

      await fetchWithCanonicalRedirects({
        target: 'https://my-domain.com/api/auth/get-session',
        method: 'GET',
        headers: { cookie: 'better-auth.session_token=secret', 'content-type': 'text/plain' },
        fetchImpl: fetchMock,
      })

      expect(fetchMock).toHaveBeenCalledTimes(2)
      const [firstCall, secondCall] = fetchMock.mock.calls
      if (!firstCall || !secondCall) {
        throw new Error('Expected two fetch calls')
      }

      // First (same-origin) request carries the cookie normally.
      const firstHeaders = firstCall[1]?.headers as Record<string, string>
      expect(firstHeaders.cookie).toBe('better-auth.session_token=secret')

      // Second (cross-origin follow) must not carry it.
      const secondHeaders = secondCall[1]?.headers as Record<string, string>
      expect(secondHeaders.cookie).toBeUndefined()
      expect(secondHeaders['content-type']).toBe('text/plain')
    })

    it('preserves the cookie header when a redirect stays same-origin', async () => {
      // Same-origin redirects are never "canonical" by this module's definition
      // (getCanonicalRedirectTarget requires a different origin), so they are
      // returned to the caller unfollowed - the single request made still
      // carries its cookie normally.
      const fetchMock = vi.fn().mockResolvedValueOnce(
        new Response('', {
          status: 302,
          headers: {
            location: 'https://my-domain.com/api/auth/callback',
          },
        }),
      )

      const response = await fetchWithCanonicalRedirects({
        target: 'https://my-domain.com/api/auth/sign-in/social',
        method: 'GET',
        headers: { cookie: 'better-auth.session_token=secret' },
        fetchImpl: fetchMock,
      })

      expect(response.status).toBe(302)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [firstCall] = fetchMock.mock.calls
      if (!firstCall) throw new Error('Expected one fetch call')
      const headers = firstCall[1]?.headers as Record<string, string>
      expect(headers.cookie).toBe('better-auth.session_token=secret')
    })

    it('stops after max canonical redirects', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          new Response('', {
            status: 307,
            headers: {
              location: 'https://www.my-domain.com/api/auth/sign-up/email',
            },
          }),
        )
        .mockResolvedValueOnce(
          new Response('', {
            status: 307,
            headers: {
              location: 'https://auth.my-domain.com/api/auth/sign-up/email',
            },
          }),
        )
        .mockResolvedValueOnce(
          new Response('', {
            status: 307,
            headers: {
              location: 'https://next.my-domain.com/api/auth/sign-up/email',
            },
          }),
        )

      const response = await fetchWithCanonicalRedirects({
        target: 'https://my-domain.com/api/auth/sign-up/email',
        method: 'POST',
        headers: {},
        maxRedirects: 2,
        fetchImpl: fetchMock,
      })

      expect(response.status).toBe(307)
      expect(fetchMock).toHaveBeenCalledTimes(3)
    })
  })
})
