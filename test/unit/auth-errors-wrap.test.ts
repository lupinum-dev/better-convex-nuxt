import { describe, expect, it } from 'vitest'

import { ConvexCallError } from '../../src/runtime/utils/call-result'
import {
  buildClientAuthResponseErrorMessage,
  wrapBetterAuthError,
} from '../../src/runtime/utils/auth-errors'

describe('wrapBetterAuthError', () => {
  it('wraps a Better Auth error object with message and status', () => {
    const error = wrapBetterAuthError(
      { message: 'Invalid credentials', status: 401 },
      'signIn',
    )
    expect(error).toBeInstanceOf(ConvexCallError)
    expect(error.message).toBe('Invalid credentials')
    expect(error.status).toBe(401)
    expect(error.operation).toBe('signIn')
    expect(error.category).toBe('auth')
  })

  it('wraps an error with code', () => {
    const error = wrapBetterAuthError(
      { message: 'Rate limited', code: 'LIMIT_CALLS', status: 429 },
      'signIn',
    )
    expect(error.code).toBe('LIMIT_CALLS')
    expect(error.category).toBe('rate_limit')
  })

  it('uses fallback message when message is missing', () => {
    const error = wrapBetterAuthError({ status: 500 }, 'signUp')
    expect(error.message).toBe('signUp failed')
    expect(error.status).toBe(500)
    expect(error.category).toBe('server')
  })

  it('uses fallback message for null input', () => {
    const error = wrapBetterAuthError(null, 'auth')
    expect(error.message).toBe('auth failed')
    expect(error.category).toBe('unknown')
  })

  it('uses fallback message for string input', () => {
    const error = wrapBetterAuthError('something went wrong', 'signIn')
    expect(error.message).toBe('signIn failed')
  })

  it('preserves the original error as cause', () => {
    const original = { message: 'Bad', status: 400 }
    const error = wrapBetterAuthError(original, 'signUp')
    expect(error.cause).toBe(original)
  })

  it('derives validation category from 422 status', () => {
    const error = wrapBetterAuthError(
      { message: 'Email already exists', status: 422 },
      'signUp',
    )
    expect(error.category).toBe('validation')
  })

  it('handles non-numeric status gracefully', () => {
    const error = wrapBetterAuthError(
      { message: 'Error', status: 'bad' },
      'signIn',
    )
    expect(error.status).toBeUndefined()
  })
})

describe('buildClientAuthResponseErrorMessage', () => {
  it('normalizes ordinary unauthenticated responses to a simple signed-out message', () => {
    expect(buildClientAuthResponseErrorMessage('Unauthorized')).toBe('Not signed in')
    expect(buildClientAuthResponseErrorMessage('invalid session')).toBe('Not signed in')
  })

  it('preserves actionable upstream diagnostics after sanitizing them', () => {
    expect(buildClientAuthResponseErrorMessage('BETTER_AUTH_SECRET mismatch')).toBe(
      'NuxtConvexError: Authentication failed. BETTER_AUTH_SECRET mismatch',
    )
  })

  it('strips duplicate prefixes and control characters from upstream messages', () => {
    expect(
      buildClientAuthResponseErrorMessage('NuxtConvexError: upstream failed\r\ncheck config'),
    ).toBe('NuxtConvexError: Authentication failed. upstream failed check config')
  })
})
