import { describe, expect, it } from 'vitest'

import { defineTenant } from '../../src/runtime/tenant/define-tenant'

describe('defineTenant', () => {
  const resolveUser = async () => null

  it('returns frozen config with defaults', () => {
    const config = defineTenant({
      scopedTables: ['posts', 'comments'] as const,
      resolveUser,
    })

    expect(config.orgField).toBe('organizationId')
    expect(config.scopedTables).toEqual(['posts', 'comments'])
    expect(config.resolveUser).toBe(resolveUser)
    expect(Object.isFrozen(config)).toBe(true)
    expect(Object.isFrozen(config.scopedTables)).toBe(true)
  })

  it('accepts custom orgField', () => {
    const config = defineTenant({
      orgField: 'tenantId',
      scopedTables: ['tasks'] as const,
      resolveUser,
    })

    expect(config.orgField).toBe('tenantId')
  })

  it('creates a copy of scopedTables array', () => {
    const tables = ['posts'] as const
    const config = defineTenant({ scopedTables: tables, resolveUser })

    // Should not be the same reference
    expect(config.scopedTables).not.toBe(tables)
    expect(config.scopedTables).toEqual(['posts'])
  })
})
