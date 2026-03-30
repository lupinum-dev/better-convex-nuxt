import { describe, expect, it } from 'vitest'

import { definePermissions } from '../../src/runtime/convex/define-permissions'

describe('definePermissions', () => {
  it('returns the same structure and preserves an explicit override', () => {
    const config = {
      roles: ['owner', 'admin'] as const,
      permissions: {
        global: {
          'org.settings': { roles: ['owner'] as const },
        },
        post: {
          create: { roles: ['owner', 'admin'] as const },
        },
      },
      checkPermission: () => true,
    }

    const result = definePermissions(config)
    expect(result).toStrictEqual(config)
    expect(result.checkPermission).toBe(config.checkPermission)
  })

  it('preserves roles and permissions structure', () => {
    const result = definePermissions({
      roles: ['viewer', 'editor'] as const,
      permissions: {
        global: {
          'app.admin': { roles: ['editor'] as const },
        },
        doc: {
          read: { roles: ['viewer', 'editor'] as const },
          write: { own: ['viewer'] as const, any: ['editor'] as const },
        },
      },
      checkPermission: () => false,
    })

    expect(result.roles).toEqual(['viewer', 'editor'])
    expect(result.permissions.global['app.admin']).toEqual({ roles: ['editor'] })
    expect(result.permissions.doc.write).toEqual({ own: ['viewer'], any: ['editor'] })
  })

  it('works with empty permissions groups', () => {
    const result = definePermissions({
      roles: ['admin'] as const,
      permissions: {
        global: {},
      },
      checkPermission: () => true,
    })

    expect(result.roles).toEqual(['admin'])
    expect(result.permissions.global).toEqual({})
  })

  it('works with dotted resource names', () => {
    const result = definePermissions({
      roles: ['admin'] as const,
      permissions: {
        global: {},
        'settings.billing': {
          view: { roles: ['admin'] as const },
        },
      },
      checkPermission: () => true,
    })

    expect(result.permissions['settings.billing'].view).toEqual({ roles: ['admin'] })
  })
})
