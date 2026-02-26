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
    expect(isConvexUnauthorizedError({ message: 'Unauthorized' })).toBe(false)
    expect(isConvexUnauthorizedError(null)).toBe(false)
  })
})
