import { describe, expect, it } from 'vitest'

import {
  deriveConvexSiteUrl,
  getSiteUrlResolutionHint,
  normalizeAuthRoute,
  resolveConvexSiteUrl,
} from '../../src/runtime/utils/convex-config'

describe('convex config helpers', () => {
  it('derives siteUrl from convex.cloud url', () => {
    expect(deriveConvexSiteUrl('https://happy-otter-123.convex.cloud')).toBe(
      'https://happy-otter-123.convex.site',
    )
  })

  it('derives siteUrl from local convex dev url', () => {
    expect(deriveConvexSiteUrl('http://127.0.0.1:3210')).toBe('http://127.0.0.1:3211')
    expect(deriveConvexSiteUrl('http://localhost:3210')).toBe('http://localhost:3211')
  })

  it('does not derive siteUrl from custom domains', () => {
    expect(deriveConvexSiteUrl('https://api.example.com')).toBeUndefined()
    expect(getSiteUrlResolutionHint('https://api.example.com')).toContain(
      'Could not derive `siteUrl`',
    )
  })

  it('returns local hint for unsupported localhost urls', () => {
    expect(getSiteUrlResolutionHint('http://localhost:3000')).toContain('local Convex dev')
  })

  it('prefers explicit siteUrl override', () => {
    const result = resolveConvexSiteUrl({
      url: 'https://happy-otter-123.convex.cloud',
      siteUrl: 'https://api.example.com',
    })
    expect(result).toEqual({
      siteUrl: 'https://api.example.com',
      source: 'explicit',
    })
  })

  it('normalizes auth route consistently', () => {
    expect(normalizeAuthRoute()).toBe('/api/auth')
    expect(normalizeAuthRoute('api/auth/')).toBe('/api/auth')
    expect(normalizeAuthRoute('/custom/auth///')).toBe('/custom/auth')
  })
})
