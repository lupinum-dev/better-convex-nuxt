import { describe, it, expect } from 'vitest'
import { matchesSkipRoute } from '../../src/runtime/utils/route-matcher'

describe('matchesSkipRoute', () => {
  describe('exact match', () => {
    it('matches exact path', () => {
      expect(matchesSkipRoute('/about', ['/about'])).toBe(true)
    })

    it('does not match different path', () => {
      expect(matchesSkipRoute('/contact', ['/about'])).toBe(false)
    })

    it('does not match subpath of exact pattern', () => {
      expect(matchesSkipRoute('/about/team', ['/about'])).toBe(false)
    })
  })

  describe('single wildcard (/*)', () => {
    it('matches direct child', () => {
      expect(matchesSkipRoute('/blog/post', ['/blog/*'])).toBe(true)
    })

    it('does not match nested child', () => {
      expect(matchesSkipRoute('/blog/post/comments', ['/blog/*'])).toBe(false)
    })

    it('does not match exact prefix', () => {
      expect(matchesSkipRoute('/blog', ['/blog/*'])).toBe(false)
    })
  })

  describe('double wildcard (/**)', () => {
    it('matches exact prefix', () => {
      expect(matchesSkipRoute('/docs', ['/docs/**'])).toBe(true)
    })

    it('matches direct child', () => {
      expect(matchesSkipRoute('/docs/guide', ['/docs/**'])).toBe(true)
    })

    it('matches deeply nested child', () => {
      expect(matchesSkipRoute('/docs/guide/auth/oauth', ['/docs/**'])).toBe(true)
    })

    it('does not match unrelated path', () => {
      expect(matchesSkipRoute('/api/docs', ['/docs/**'])).toBe(false)
    })
  })

  describe('multiple patterns', () => {
    it('matches any pattern', () => {
      const patterns = ['/', '/about', '/docs/**', '/blog/*']

      expect(matchesSkipRoute('/', patterns)).toBe(true)
      expect(matchesSkipRoute('/about', patterns)).toBe(true)
      expect(matchesSkipRoute('/docs/guide', patterns)).toBe(true)
      expect(matchesSkipRoute('/blog/post', patterns)).toBe(true)
    })

    it('does not match non-matching path', () => {
      const patterns = ['/', '/about', '/docs/**']

      expect(matchesSkipRoute('/dashboard', patterns)).toBe(false)
      expect(matchesSkipRoute('/app/settings', patterns)).toBe(false)
    })
  })

  describe('empty patterns', () => {
    it('returns false for empty pattern array', () => {
      expect(matchesSkipRoute('/any/path', [])).toBe(false)
    })
  })
})
