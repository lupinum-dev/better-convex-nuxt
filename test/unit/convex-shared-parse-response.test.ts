import { describe, expect, it } from 'vitest'

import { parseConvexResponse } from '../../src/runtime/utils/convex-shared'

describe('parseConvexResponse', () => {
  it('unwraps a success response value', () => {
    expect(parseConvexResponse({ status: 'success', value: { id: '1' } })).toEqual({ id: '1' })
  })

  it('unwraps a value-only response without a status field', () => {
    expect(parseConvexResponse({ value: 42 })).toBe(42)
  })

  it('throws on status: "error" responses', () => {
    expect(() => parseConvexResponse({ status: 'error', errorMessage: 'boom' })).toThrowError(
      'boom',
    )
  })

  it('does not throw when a success value legitimately contains a code field (F-33)', () => {
    // A query returning domain data shaped like `{ code: 'x' }` must not be
    // mistaken for a Convex error response — only status === 'error' is an error.
    const result = parseConvexResponse({ status: 'success', value: { code: 'x' } })
    expect(result).toEqual({ code: 'x' })
  })

  it('does not throw when a bare object (no status) carries a code field', () => {
    const result = parseConvexResponse({ code: 'x', message: 'not actually an error' })
    expect(result).toEqual({ code: 'x', message: 'not actually an error' })
  })

  it('returns a direct primitive value unchanged', () => {
    expect(parseConvexResponse('hello')).toBe('hello')
    expect(parseConvexResponse(null)).toBe(null)
  })
})
