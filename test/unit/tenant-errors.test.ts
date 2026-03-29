import { describe, expect, it } from 'vitest'

import { TenantError } from '../../src/runtime/tenant/errors'

describe('TenantError', () => {
  it('creates error with code and message', () => {
    const err = new TenantError('Not logged in', 'UNAUTHENTICATED')
    expect(err.message).toBe('Not logged in')
    expect(err.code).toBe('UNAUTHENTICATED')
    expect(err.name).toBe('TenantError')
  })

  it('has isTenantError brand', () => {
    const err = new TenantError('test', 'CROSS_ORG_ACCESS')
    expect(err.isTenantError).toBe(true)
  })

  it('is instanceof Error', () => {
    const err = new TenantError('test', 'PERMISSION_DENIED')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(TenantError)
  })

  it('supports cause option', () => {
    const cause = new Error('original')
    const err = new TenantError('wrapped', 'CROSS_ORG_ACCESS', { cause })
    expect(err.cause).toBe(cause)
  })

  it('supports all error codes', () => {
    const codes = [
      'UNAUTHENTICATED',
      'NO_ORGANIZATION',
      'CROSS_ORG_ACCESS',
      'MISSING_ORG_INDEX',
      'TABLE_NOT_SCOPED',
      'ORG_FIELD_CONFLICT',
      'PERMISSION_DENIED',
      'RESOURCE_NOT_FOUND',
    ] as const

    for (const code of codes) {
      const err = new TenantError(`test ${code}`, code)
      expect(err.code).toBe(code)
    }
  })
})
