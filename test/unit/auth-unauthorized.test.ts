import { describe, expect, it } from 'vitest'

import { isConvexUnauthorizedError } from '../../src/runtime/utils/auth-unauthorized-core'

describe('isConvexUnauthorizedError', () => {
  it('detects common unauthorized error messages', () => {
    expect(isConvexUnauthorizedError(new Error('ConvexError: Unauthorized'))).toBe(true)
    expect(isConvexUnauthorizedError(new Error('User is not authenticated'))).toBe(true)
    expect(isConvexUnauthorizedError('Authentication failed')).toBe(true)
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
