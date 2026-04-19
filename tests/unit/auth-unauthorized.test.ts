import { describe, expect, it } from 'vitest'

import { isConvexUnauthorizedError } from '../../src/runtime/utils/auth-unauthorized-core'

describe('isConvexUnauthorizedError', () => {
  it('does not match plain message strings (string matching removed to avoid false positives)', () => {
    expect(isConvexUnauthorizedError(new Error('ConvexError: Unauthorized'))).toBe(false)
    expect(isConvexUnauthorizedError(new Error('User is not authenticated'))).toBe(false)
    expect(isConvexUnauthorizedError('Authentication failed')).toBe(false)
  })

  it('does not match unrelated errors', () => {
    expect(isConvexUnauthorizedError(new Error('Network timeout'))).toBe(false)
    expect(isConvexUnauthorizedError(null)).toBe(false)
  })

  it('detects structured status/code unauthorized errors', () => {
    expect(isConvexUnauthorizedError({ status: 401 })).toBe(true)
    expect(isConvexUnauthorizedError({ status: 403 })).toBe(true)
    expect(isConvexUnauthorizedError({ code: 'UNAUTHORIZED' })).toBe(true)
    expect(isConvexUnauthorizedError({ data: { status: 401 } })).toBe(true)
  })
})
