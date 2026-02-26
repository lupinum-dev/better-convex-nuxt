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

  it('does not derive siteUrl from custom domains', () => {
    expect(deriveConvexSiteUrl('https://api.example.com')).toBeUndefined()
    expect(getSiteUrlResolutionHint('https://api.example.com')).toContain('Could not derive `siteUrl`')
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

