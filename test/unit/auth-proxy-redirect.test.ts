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
    it('returns redirect target only when redirect stays on the allowed origin', () => {
      const target = getCanonicalRedirectTarget(
        'https://app.example.com/api/auth/sign-up/email?foo=bar',
        'https://demo.convex.site/api/auth/sign-up/email?foo=bar',
        'https://demo.convex.site',
      )
      expect(target).toBe('https://demo.convex.site/api/auth/sign-up/email?foo=bar')
    })

    it('returns null for canonical-looking redirects to a different origin', () => {
      const target = getCanonicalRedirectTarget(
        'https://demo.convex.site/api/auth/sign-up/email?foo=bar',
        'https://evil.example.com/api/auth/sign-up/email?foo=bar',
        'https://demo.convex.site',
      )
      expect(target).toBeNull()
    })

    it('returns null for different path redirects', () => {
      const target = getCanonicalRedirectTarget(
        'https://demo.convex.site/api/auth/sign-up/email',
        'https://demo.convex.site/oauth/authorize',
        'https://demo.convex.site',
      )
      expect(target).toBeNull()
    })
  })

  describe('fetchWithCanonicalRedirects', () => {
    it('follows canonical redirects only when they stay on the allowed origin', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          new Response('', {
            status: 307,
            headers: {
              location: 'https://demo.convex.site/api/auth/sign-up/email?foo=bar',
            },
          }),
        )
        .mockResolvedValueOnce(new Response('ok', { status: 200 }))

      const response = await fetchWithCanonicalRedirects({
        target: 'https://demo.convex.cloud/api/auth/sign-up/email?foo=bar',
        allowedOrigin: 'https://demo.convex.site',
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
      expect(firstCall[0]).toBe('https://demo.convex.cloud/api/auth/sign-up/email?foo=bar')
      expect(secondCall[0]).toBe('https://demo.convex.site/api/auth/sign-up/email?foo=bar')
    })

    it('does not follow provider redirects (oauth style)', async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(
        new Response('', {
          status: 302,
          headers: {
            location: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=abc',
          },
        }),
      )

      const response = await fetchWithCanonicalRedirects({
        target: 'https://demo.convex.site/api/auth/sign-in/social',
        allowedOrigin: 'https://demo.convex.site',
        method: 'GET',
        headers: {},
        fetchImpl: fetchMock,
      })

      expect(response.status).toBe(302)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('does not follow canonical-looking redirects to an off-origin host', async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(
        new Response('', {
          status: 307,
          headers: {
            location: 'https://evil.example.com/api/auth/sign-up/email',
          },
        }),
      )

      const response = await fetchWithCanonicalRedirects({
        target: 'https://demo.convex.site/api/auth/sign-up/email',
        allowedOrigin: 'https://demo.convex.site',
        method: 'POST',
        headers: {},
        fetchImpl: fetchMock,
      })

      expect(response.status).toBe(307)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('stops after max allowed-origin canonical redirects', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          new Response('', {
            status: 307,
            headers: {
              location: 'https://demo.convex.site/api/auth/sign-up/email',
            },
          }),
        )
        .mockResolvedValueOnce(
          new Response('', {
            status: 307,
            headers: {
              location: 'https://demo.convex.site/api/auth/sign-up/email',
            },
          }),
        )
        .mockResolvedValueOnce(
          new Response('', {
            status: 307,
            headers: {
              location: 'https://demo.convex.site/api/auth/sign-up/email',
            },
          }),
        )

      const response = await fetchWithCanonicalRedirects({
        target: 'https://demo.convex.cloud/api/auth/sign-up/email',
        allowedOrigin: 'https://demo.convex.site',
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
