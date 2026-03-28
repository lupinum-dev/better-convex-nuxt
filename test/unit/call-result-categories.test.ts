import { describe, expect, it } from 'vitest'

import { categorizeError, ConvexCallError, toConvexError } from '../../src/runtime/utils/call-result'

describe('categorizeError', () => {
  describe('code-based categorization', () => {
    it('maps UNAUTHENTICATED to auth', () => {
      expect(categorizeError('UNAUTHENTICATED')).toBe('auth')
    })

    it('maps FORBIDDEN to auth', () => {
      expect(categorizeError('FORBIDDEN')).toBe('auth')
    })

    it('maps codes containing "unauth" to auth (case-insensitive)', () => {
      expect(categorizeError('Unauthenticated')).toBe('auth')
    })

    it('maps LIMIT_* codes to rate_limit', () => {
      expect(categorizeError('LIMIT_CALLS')).toBe('rate_limit')
      expect(categorizeError('LIMIT_BANDWIDTH')).toBe('rate_limit')
    })

    it('maps NOT_FOUND to not_found', () => {
      expect(categorizeError('NOT_FOUND')).toBe('not_found')
    })

    it('maps VALIDATION to validation', () => {
      expect(categorizeError('VALIDATION')).toBe('validation')
    })

    it('maps INVALID_ARGS to validation', () => {
      expect(categorizeError('INVALID_ARGS')).toBe('validation')
    })

    it('maps CONFLICT to conflict', () => {
      expect(categorizeError('CONFLICT')).toBe('conflict')
    })

    it('maps INTERNAL_ERROR to server', () => {
      expect(categorizeError('INTERNAL_ERROR')).toBe('server')
    })

    it('maps INTERNAL to server', () => {
      expect(categorizeError('INTERNAL')).toBe('server')
    })

    it('returns unknown for unrecognized codes', () => {
      expect(categorizeError('SOME_CUSTOM_CODE')).toBe('unknown')
    })
  })

  describe('status-based categorization', () => {
    it('maps 401 to auth', () => {
      expect(categorizeError(undefined, 401)).toBe('auth')
    })

    it('maps 403 to auth', () => {
      expect(categorizeError(undefined, 403)).toBe('auth')
    })

    it('maps 400 to validation', () => {
      expect(categorizeError(undefined, 400)).toBe('validation')
    })

    it('maps 422 to validation', () => {
      expect(categorizeError(undefined, 422)).toBe('validation')
    })

    it('maps 404 to not_found', () => {
      expect(categorizeError(undefined, 404)).toBe('not_found')
    })

    it('maps 409 to conflict', () => {
      expect(categorizeError(undefined, 409)).toBe('conflict')
    })

    it('maps 429 to rate_limit', () => {
      expect(categorizeError(undefined, 429)).toBe('rate_limit')
    })

    it('maps 500 to server', () => {
      expect(categorizeError(undefined, 500)).toBe('server')
    })

    it('maps 503 to server', () => {
      expect(categorizeError(undefined, 503)).toBe('server')
    })

    it('returns unknown for unrecognized status', () => {
      expect(categorizeError(undefined, 200)).toBe('unknown')
    })
  })

  describe('precedence', () => {
    it('code takes precedence over status', () => {
      // Code says auth, status says validation — code wins
      expect(categorizeError('UNAUTHENTICATED', 400)).toBe('auth')
    })

    it('falls back to status when code is unrecognized', () => {
      expect(categorizeError('CUSTOM', 429)).toBe('rate_limit')
    })
  })

  describe('edge cases', () => {
    it('returns unknown when both are undefined', () => {
      expect(categorizeError(undefined, undefined)).toBe('unknown')
    })

    it('returns unknown when called with no arguments', () => {
      expect(categorizeError()).toBe('unknown')
    })
  })
})

describe('ConvexCallError category integration', () => {
  it('auto-derives category from code', () => {
    const error = new ConvexCallError('rate limited', { code: 'LIMIT_CALLS' })
    expect(error.category).toBe('rate_limit')
  })

  it('auto-derives category from status', () => {
    const error = new ConvexCallError('not found', { status: 404 })
    expect(error.category).toBe('not_found')
  })

  it('allows explicit category override', () => {
    const error = new ConvexCallError('custom', { status: 500, category: 'conflict' })
    expect(error.category).toBe('conflict')
  })

  it('defaults to unknown when no code or status', () => {
    const error = new ConvexCallError('something happened')
    expect(error.category).toBe('unknown')
  })

  it('isRecoverable returns true for auth', () => {
    const error = new ConvexCallError('auth', { code: 'UNAUTHENTICATED' })
    expect(error.isRecoverable).toBe(true)
  })

  it('isRecoverable returns true for network', () => {
    const error = new ConvexCallError('network', { category: 'network' })
    expect(error.isRecoverable).toBe(true)
  })

  it('isRecoverable returns true for rate_limit', () => {
    const error = new ConvexCallError('limited', { code: 'LIMIT_CALLS' })
    expect(error.isRecoverable).toBe(true)
  })

  it('isRecoverable returns false for server', () => {
    const error = new ConvexCallError('server', { status: 500 })
    expect(error.isRecoverable).toBe(false)
  })

  it('isRecoverable returns false for validation', () => {
    const error = new ConvexCallError('invalid', { code: 'VALIDATION' })
    expect(error.isRecoverable).toBe(false)
  })

  it('isRecoverable returns false for unknown', () => {
    const error = new ConvexCallError('unknown')
    expect(error.isRecoverable).toBe(false)
  })
})

describe('toConvexError category and issues', () => {
  it('preserves category from structured error data', () => {
    const error = toConvexError({
      data: { message: 'Unauthorized', code: 'UNAUTHENTICATED', status: 401 },
    })
    expect(error.category).toBe('auth')
  })

  it('extracts issues from structured data', () => {
    const error = toConvexError({
      data: {
        message: 'Validation failed',
        code: 'VALIDATION',
        status: 400,
        issues: [
          { path: 'email', message: 'Invalid email' },
          { field: 'name', message: 'Required', code: 'REQUIRED' },
        ],
      },
    })
    expect(error.category).toBe('validation')
    expect(error.issues).toEqual([
      { path: 'email', message: 'Invalid email', code: undefined },
      { path: 'name', message: 'Required', code: 'REQUIRED' },
    ])
  })

  it('extracts issues from errors array', () => {
    const error = toConvexError({
      data: {
        message: 'Bad request',
        status: 400,
        errors: [{ path: 'title', message: 'Too long' }],
      },
    })
    expect(error.issues).toEqual([
      { path: 'title', message: 'Too long', code: undefined },
    ])
  })

  it('extracts issues from fieldErrors array', () => {
    const error = toConvexError({
      data: {
        message: 'Invalid',
        status: 422,
        fieldErrors: [{ field: 'age', message: 'Must be positive' }],
      },
    })
    expect(error.issues).toEqual([
      { path: 'age', message: 'Must be positive', code: undefined },
    ])
  })

  it('ignores empty issues array', () => {
    const error = toConvexError({
      data: { message: 'Error', status: 400, issues: [] },
    })
    expect(error.issues).toBeUndefined()
  })

  it('ignores non-array issues', () => {
    const error = toConvexError({
      data: { message: 'Error', status: 400, issues: 'not an array' },
    })
    expect(error.issues).toBeUndefined()
  })

  it('categorizes TypeError as network error', () => {
    const error = toConvexError(new TypeError('Failed to fetch'))
    expect(error.category).toBe('network')
  })

  it('passes through existing ConvexCallError unchanged', () => {
    const original = new ConvexCallError('test', { code: 'LIMIT_CALLS' })
    const result = toConvexError(original)
    expect(result).toBe(original)
    expect(result.category).toBe('rate_limit')
  })
})
