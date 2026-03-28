import { describe, expect, it } from 'vitest'

import {
  validateRedirectPath,
  resolveRedirectTarget,
} from '../../src/runtime/utils/redirect-safety'

describe('validateRedirectPath', () => {
  describe('valid paths', () => {
    it('accepts simple relative paths', () => {
      expect(validateRedirectPath('/dashboard')).toBe('/dashboard')
    })

    it('accepts paths with query strings', () => {
      expect(validateRedirectPath('/dashboard?tab=team')).toBe('/dashboard?tab=team')
    })

    it('accepts nested paths', () => {
      expect(validateRedirectPath('/a/b/c')).toBe('/a/b/c')
    })

    it('accepts root path', () => {
      expect(validateRedirectPath('/')).toBe('/')
    })

    it('accepts paths with hash fragments', () => {
      expect(validateRedirectPath('/page#section')).toBe('/page#section')
    })

    it('trims whitespace', () => {
      expect(validateRedirectPath('  /dashboard  ')).toBe('/dashboard')
    })
  })

  describe('rejected inputs', () => {
    it('rejects null', () => {
      expect(validateRedirectPath(null)).toBeNull()
    })

    it('rejects undefined', () => {
      expect(validateRedirectPath(undefined)).toBeNull()
    })

    it('rejects empty string', () => {
      expect(validateRedirectPath('')).toBeNull()
    })

    it('rejects whitespace-only string', () => {
      expect(validateRedirectPath('   ')).toBeNull()
    })

    it('rejects absolute URLs', () => {
      expect(validateRedirectPath('https://evil.com')).toBeNull()
    })

    it('rejects http absolute URLs', () => {
      expect(validateRedirectPath('http://evil.com')).toBeNull()
    })

    it('rejects protocol-relative URLs', () => {
      expect(validateRedirectPath('//evil.com')).toBeNull()
    })

    it('rejects paths containing double slashes', () => {
      expect(validateRedirectPath('/foo//bar')).toBeNull()
    })

    it('rejects path traversal with double slashes', () => {
      expect(validateRedirectPath('/foo//evil.com')).toBeNull()
    })

    it('rejects javascript: protocol', () => {
      expect(validateRedirectPath('javascript:alert(1)')).toBeNull()
    })

    it('rejects data: protocol', () => {
      expect(validateRedirectPath('data:text/html,<h1>hi</h1>')).toBeNull()
    })

    it('rejects relative paths without leading slash', () => {
      expect(validateRedirectPath('dashboard')).toBeNull()
    })

    it('rejects paths that are just a domain', () => {
      expect(validateRedirectPath('evil.com')).toBeNull()
    })
  })
})

describe('resolveRedirectTarget', () => {
  it('returns validated path when raw is valid', () => {
    expect(resolveRedirectTarget('/dashboard', '/')).toBe('/dashboard')
  })

  it('returns fallback when raw is null', () => {
    expect(resolveRedirectTarget(null, '/home')).toBe('/home')
  })

  it('returns fallback when raw is invalid', () => {
    expect(resolveRedirectTarget('https://evil.com', '/home')).toBe('/home')
  })

  it('returns fallback when raw is empty', () => {
    expect(resolveRedirectTarget('', '/home')).toBe('/home')
  })

  it('prevents login-page loops', () => {
    expect(resolveRedirectTarget('/auth/signin', '/', '/auth/signin')).toBe('/')
  })

  it('prevents login-page loops with query params on target', () => {
    expect(resolveRedirectTarget('/auth/signin?foo=bar', '/', '/auth/signin')).toBe('/')
  })

  it('prevents login-page loops with query params on login path', () => {
    expect(resolveRedirectTarget('/auth/signin', '/', '/auth/signin?redirect=%2Ffoo')).toBe('/')
  })

  it('does not prevent loops when login path is not provided', () => {
    expect(resolveRedirectTarget('/auth/signin', '/')).toBe('/auth/signin')
  })

  it('does not block different paths from the login page', () => {
    expect(resolveRedirectTarget('/dashboard', '/', '/auth/signin')).toBe('/dashboard')
  })

  it('uses fallback for undefined raw', () => {
    expect(resolveRedirectTarget(undefined, '/fallback')).toBe('/fallback')
  })

  it('preserves query params on valid redirect', () => {
    expect(resolveRedirectTarget('/dashboard?tab=team', '/')).toBe('/dashboard?tab=team')
  })
})
