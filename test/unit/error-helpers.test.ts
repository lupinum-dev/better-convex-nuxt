import { describe, expect, it } from 'vitest'

import { cleanErrorMessage, inferCategoryFromMessage } from '../../src/runtime/mcp/error-helpers'

describe('cleanErrorMessage', () => {
  it('strips serverConvexMutation prefix', () => {
    expect(
      cleanErrorMessage('[serverConvexMutation] Request failed for posts:create via http://localhost/api. Something broke'),
    ).toBe('Something broke')
  })

  it('strips Request ID markers', () => {
    expect(
      cleanErrorMessage('[Request ID: abc-123] Not found'),
    ).toBe('Not found')
  })

  it('strips stack traces', () => {
    expect(
      cleanErrorMessage('Bad input\n    at Object.handler (file.ts:10:5)\n    at process (runtime.ts:42:3)'),
    ).toBe('Bad input')
  })

  it('extracts message from Uncaught Error pattern', () => {
    expect(
      cleanErrorMessage('Server Error\nUncaught Error: You are not allowed'),
    ).toBe('You are not allowed')
  })

  it('extracts message from plain Error pattern', () => {
    expect(
      cleanErrorMessage('Error: Something went wrong'),
    ).toBe('Something went wrong')
  })

  it('returns original message when nothing to clean', () => {
    expect(cleanErrorMessage('Simple error')).toBe('Simple error')
  })

  it('returns original message for empty cleaned result', () => {
    expect(cleanErrorMessage('')).toBe('')
  })
})

describe('inferCategoryFromMessage', () => {
  it('infers auth from unauthorized', () => {
    expect(inferCategoryFromMessage('Unauthorized access')).toBe('auth')
  })

  it('infers auth from unauthenticated', () => {
    expect(inferCategoryFromMessage('User is unauthenticated')).toBe('auth')
  })

  it('infers auth from forbidden', () => {
    expect(inferCategoryFromMessage('Forbidden: insufficient permissions')).toBe('auth')
  })

  it('infers not_found', () => {
    expect(inferCategoryFromMessage('Resource not found')).toBe('not_found')
  })

  it('infers rate_limit from rate limit', () => {
    expect(inferCategoryFromMessage('Rate limit exceeded')).toBe('rate_limit')
  })

  it('infers rate_limit from too many', () => {
    expect(inferCategoryFromMessage('Too many requests')).toBe('rate_limit')
  })

  it('infers validation', () => {
    expect(inferCategoryFromMessage('Validation failed for field')).toBe('validation')
  })

  it('infers validation from invalid arg', () => {
    expect(inferCategoryFromMessage('Invalid argument: title')).toBe('validation')
  })

  it('returns undefined for unknown messages', () => {
    expect(inferCategoryFromMessage('Something unexpected happened')).toBeUndefined()
  })

  it('is case insensitive', () => {
    expect(inferCategoryFromMessage('UNAUTHORIZED')).toBe('auth')
    expect(inferCategoryFromMessage('NOT FOUND')).toBe('not_found')
  })
})
