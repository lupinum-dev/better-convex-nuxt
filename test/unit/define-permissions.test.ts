import { describe, expect, it } from 'vitest'

import { definePermissions } from '../../src/runtime/convex/define-permissions'

describe('definePermissions', () => {
  it('returns the same structure and preserves an explicit override', () => {
    const config = {
      roles: ['owner', 'admin'] as const,
      rules: {
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
      rules: {
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
    expect(result.rules.global['app.admin']).toEqual({ roles: ['editor'] })
    expect(result.rules.doc.write).toEqual({ own: ['viewer'], any: ['editor'] })
  })

  it('works with empty permissions groups', () => {
    const result = definePermissions({
      roles: ['admin'] as const,
      rules: {
        global: {},
      },
      checkPermission: () => true,
    })

    expect(result.roles).toEqual(['admin'])
    expect(result.rules.global).toEqual({})
  })

  it('works with dotted resource names', () => {
    const result = definePermissions({
      roles: ['admin'] as const,
      rules: {
        global: {},
        'settings.billing': {
          view: { roles: ['admin'] as const },
        },
      },
      checkPermission: () => true,
    })

    expect(result.rules['settings.billing'].view).toEqual({ roles: ['admin'] })
  })

  it('generates structured evaluation details for ownership denials', () => {
    const result = definePermissions({
      roles: ['owner', 'member'] as const,
      rules: {
        todo: {
          update: { own: ['member'] as const, any: ['owner'] as const },
        },
      },
    })

    expect(result.evaluatePermission).toBeTypeOf('function')
    expect(
      result.evaluatePermission!(
        { role: 'member', userId: 'alice' },
        'todo.update',
        { ownerId: 'bob' },
      ),
    ).toMatchObject({
      allowed: false,
      mode: 'own',
      permission: 'todo.update',
    })
  })
})
