import { describe, expect, it } from 'vitest'

import { isOriginAllowed } from '../../src/runtime/server/api/auth/security'

describe('auth proxy trusted origin wildcard matching', () => {
  it('matches wildcard labels and rejects cross-label wildcards', () => {
    const requestOrigin = 'https://app.example.com'
    const trusted = ['https://preview-*.vercel.app']

    expect(isOriginAllowed('https://preview-123.vercel.app', requestOrigin, trusted)).toBe(true)

    expect(isOriginAllowed('https://preview-a.b.vercel.app', requestOrigin, trusted)).toBe(false)
  })
})
