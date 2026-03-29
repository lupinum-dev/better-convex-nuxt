import { describe, expect, it } from 'vitest'

import { withSummary, wrapError, wrapPreview, wrapSuccess } from '../../src/runtime/mcp/result-envelope'
import type {
  ConvexToolErrorResult,
  ConvexToolPreviewResult,
} from '../../src/runtime/mcp/types'

function getErrorResult(result: { structuredContent?: unknown }): ConvexToolErrorResult {
  return result.structuredContent as ConvexToolErrorResult
}

function getPreviewResult(result: { structuredContent?: unknown }): ConvexToolPreviewResult {
  return result.structuredContent as ConvexToolPreviewResult
}

describe('wrapSuccess', () => {
  it('wraps plain data with ok: true envelope', () => {
    const result = wrapSuccess({ id: 'abc', title: 'Hello' })

    expect(result.structuredContent).toEqual({
      ok: true,
      data: { id: 'abc', title: 'Hello' },
    })
    expect(result.content).toEqual([
      { type: 'text', text: JSON.stringify({ id: 'abc', title: 'Hello' }) },
    ])
    expect(result.isError).toBeUndefined()
  })

  it('uses summary as text when withSummary is used', () => {
    const result = wrapSuccess(withSummary({ id: 'abc' }, 'Created post abc'))

    expect(result.structuredContent).toEqual({
      ok: true,
      data: { id: 'abc' },
    })
    expect(result.content).toEqual([
      { type: 'text', text: 'Created post abc' },
    ])
  })

  it('does not split plain objects with data+summary fields', () => {
    const result = wrapSuccess({ data: [1, 2], summary: 'report' })

    expect(result.structuredContent).toEqual({
      ok: true,
      data: { data: [1, 2], summary: 'report' },
    })
  })

  it('wraps primitive values', () => {
    expect(wrapSuccess(42).structuredContent).toEqual({ ok: true, data: 42 })
    expect(wrapSuccess('hello').structuredContent).toEqual({ ok: true, data: 'hello' })
    expect(wrapSuccess(null).structuredContent).toEqual({ ok: true, data: null })
  })

  it('wraps undefined safely', () => {
    const result = wrapSuccess(undefined)
    expect(result.structuredContent).toEqual({ ok: true, data: undefined })
    expect(result.content).toEqual([
      { type: 'text', text: 'undefined' },
    ])
  })

  it('wraps arrays', () => {
    const result = wrapSuccess([1, 2, 3])
    expect(result.structuredContent).toEqual({ ok: true, data: [1, 2, 3] })
  })
})

describe('wrapError', () => {
  it('wraps error with category and retryable flag', () => {
    const result = wrapError('auth', 'Authentication required')

    expect(result.structuredContent).toEqual({
      ok: false,
      error: {
        category: 'auth',
        message: 'Authentication required',
        retryable: true,
      },
    })
    expect(result.content).toEqual([
      { type: 'text', text: 'Authentication required' },
    ])
    expect(result.isError).toBe(true)
  })

  it('marks not_found as non-retryable', () => {
    const result = wrapError('not_found', 'Post not found')
    expect(getErrorResult(result).error.retryable).toBe(false)
  })

  it('marks unknown as non-retryable', () => {
    const result = wrapError('unknown', 'Something went wrong')
    expect(getErrorResult(result).error.retryable).toBe(false)
  })

  it('includes validation issues when provided', () => {
    const result = wrapError('validation', 'Validation failed', [
      { path: 'title', message: 'Required' },
      { path: 'content', message: 'Expected string' },
    ])

    expect(getErrorResult(result).error.issues).toEqual([
      { path: 'title', message: 'Required' },
      { path: 'content', message: 'Expected string' },
    ])
  })

  it('marks all expected categories as retryable', () => {
    const retryable = ['auth', 'validation', 'rate_limit', 'scope_exceeded', 'confirmation_required', 'cooldown', 'network', 'server', 'conflict'] as const
    for (const cat of retryable) {
      const result = wrapError(cat, 'test')
      expect(getErrorResult(result).error.retryable, `${cat} should be retryable`).toBe(true)
    }
  })
})

describe('wrapPreview', () => {
  it('wraps preview with awaitingConfirmation', () => {
    const result = wrapPreview({
      summary: 'Will delete "My Post"',
      affects: { posts: 1 },
    })

    expect(result.structuredContent).toEqual({
      ok: true,
      preview: {
        summary: 'Will delete "My Post"',
        affects: { posts: 1 },
      },
      awaitingConfirmation: true,
    })
    expect(result.content).toEqual([
      { type: 'text', text: 'Will delete "My Post"' },
    ])
    expect(result.isError).toBeUndefined()
  })

  it('includes warn and blocked fields', () => {
    const result = wrapPreview({
      summary: 'Cannot delete',
      warn: 'Permission denied',
      blocked: true,
    })

    expect(getPreviewResult(result).preview.warn).toBe('Permission denied')
    expect(getPreviewResult(result).preview.blocked).toBe(true)
  })
})

describe('withSummary', () => {
  it('creates a branded object recognized by wrapSuccess', () => {
    const value = withSummary({ id: 'abc' }, 'Created post')
    expect(value.data).toEqual({ id: 'abc' })
    expect(value.summary).toBe('Created post')

    const result = wrapSuccess(value)
    expect(result.structuredContent).toEqual({
      ok: true,
      data: { id: 'abc' },
    })
    expect(result.content).toEqual([
      { type: 'text', text: 'Created post' },
    ])
  })
})
