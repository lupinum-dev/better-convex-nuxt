import { describe, expect, it } from 'vitest'

import { ScopingError } from '../../src/runtime/scoping/errors'

describe('ScopingError', () => {
  it('creates error with code and message', () => {
    const err = new ScopingError('Cross-org access', 'CROSS_ORG_ACCESS')
    expect(err.message).toBe('Cross-org access')
    expect(err.code).toBe('CROSS_ORG_ACCESS')
    expect(err.name).toBe('ScopingError')
  })

  it('is instanceof Error', () => {
    const err = new ScopingError('Missing index', 'MISSING_ORG_INDEX')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(ScopingError)
  })

  it('supports cause option', () => {
    const cause = new Error('original')
    const err = new ScopingError('wrapped', 'RESOURCE_NOT_FOUND', { cause })
    expect((err as Error & { cause?: unknown }).cause).toBe(cause)
  })
})
