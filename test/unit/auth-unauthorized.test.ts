import { describe, expect, it } from 'vitest'

import { isConvexUnauthorizedError } from '../../src/runtime/utils/auth-unauthorized-core'

describe('isConvexUnauthorizedError', () => {
  // F-24: sign-out on a match is destructive, so only structured signals
  // (status/code) are trusted - never a substring of a prose message.
  it('does not match prose-only messages, even ones containing "authentication"', () => {
    expect(isConvexUnauthorizedError(new Error('Authentication failed'))).toBe(false)
    expect(isConvexUnauthorizedError('Authentication failed')).toBe(false)
    expect(isConvexUnauthorizedError(new Error('Two-factor authentication required'))).toBe(false)
  })

  it('does not treat 403/FORBIDDEN (authorization) as an authentication failure', () => {
    expect(isConvexUnauthorizedError({ status: 403 })).toBe(false)
    expect(isConvexUnauthorizedError({ code: 'FORBIDDEN' })).toBe(false)
    expect(isConvexUnauthorizedError({ data: { status: 403 } })).toBe(false)
    expect(isConvexUnauthorizedError({ data: { code: 'FORBIDDEN' } })).toBe(false)
  })

  it('does not match unrelated errors', () => {
    expect(isConvexUnauthorizedError(new Error('Network timeout'))).toBe(false)
    expect(isConvexUnauthorizedError(null)).toBe(false)
  })

  it('detects structured 401/UNAUTHENTICATED-coded errors', () => {
    expect(isConvexUnauthorizedError({ status: 401 })).toBe(true)
    expect(isConvexUnauthorizedError({ code: 'UNAUTHENTICATED' })).toBe(true)
    expect(isConvexUnauthorizedError({ data: { status: 401 } })).toBe(true)
    expect(isConvexUnauthorizedError({ data: { code: 'UNAUTHENTICATED' } })).toBe(true)
  })
})
