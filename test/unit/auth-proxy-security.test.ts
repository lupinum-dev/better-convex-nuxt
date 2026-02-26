import { describe, expect, it } from 'vitest'

import { getAuthRoutePattern, isOriginAllowed } from '../../src/runtime/server/api/auth/security'

describe('auth proxy security helpers', () => {
  describe('isOriginAllowed', () => {
    it('allows exact same origin', () => {
      expect(isOriginAllowed('https://example.com', 'https://example.com', [])).toBe(true)
    })

    it('rejects same host with different scheme', () => {
      expect(isOriginAllowed('http://example.com', 'https://example.com', [])).toBe(false)
    })

    it('rejects same host with different port', () => {
      expect(isOriginAllowed('https://example.com:444', 'https://example.com:443', [])).toBe(false)
    })

    it('allows trusted exact origins', () => {
      expect(isOriginAllowed('https://preview.example.com', 'https://app.example.com', ['https://preview.example.com'])).toBe(true)
    })

    it('allows trusted wildcard origins', () => {
      expect(
        isOriginAllowed(
          'https://preview-123.vercel.app',
          'https://app.example.com',
          ['https://preview-*.vercel.app'],
        ),
      ).toBe(true)
    })

    it('rejects wildcard suffix-trick domains', () => {
      expect(
        isOriginAllowed(
          'https://preview-123.vercel.app.evil.com',
          'https://app.example.com',
          ['https://preview-*.vercel.app'],
        ),
      ).toBe(false)
    })

    it('rejects extra subdomain depth when wildcard only matches one label', () => {
      expect(
        isOriginAllowed(
          'https://foo.bar.example.com',
          'https://app.example.com',
          ['https://*.example.com'],
        ),
      ).toBe(false)
    })

    it('rejects trusted origin entries with paths (not origin patterns)', () => {
      expect(
        isOriginAllowed(
          'https://preview.example.com',
          'https://app.example.com',
          ['https://preview.example.com/path'],
        ),
      ).toBe(false)
    })

    it('fails closed on malformed trusted origin patterns', () => {
      expect(
        isOriginAllowed(
          'https://preview.example.com',
          'https://app.example.com',
          ['not-a-url'],
        ),
      ).toBe(false)
    })
  })

  describe('getAuthRoutePattern', () => {
    it('escapes regex characters and strips configured auth route prefix', () => {
      const pattern = getAuthRoutePattern('/api/auth.v2')
      expect('/api/auth.v2/convex/token'.replace(pattern, '')).toBe('/convex/token')
    })

    it('caches compiled regex instances per route', () => {
      expect(getAuthRoutePattern('/api/auth')).toBe(getAuthRoutePattern('/api/auth'))
    })
  })
})
