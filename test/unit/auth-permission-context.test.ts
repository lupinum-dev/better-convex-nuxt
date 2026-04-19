import { ConvexError } from 'convex/values'
import { describe, expect, it } from 'vitest'

import { defineGuard, open } from '../../src/runtime/auth'
import { definePermissionContext } from '../../src/runtime/auth/define-permission-context'

describe('permission context primitives', () => {
  it('builds a permission context from guard declarations', async () => {
    const canCreate = defineGuard<{ userId: string; role: string }>(
      'todo.create',
      (actor) => actor.role !== 'viewer',
    )
    const canManage = defineGuard<{ userId: string; role: string }>(
      'workspace.members',
      (actor) => actor.role === 'owner',
    )

    const query = definePermissionContext({
      resolve: async () => ({
        userId: 'alice',
        tenantId: 'workspace-1',
        role: 'admin',
        plan: 'pro',
      }),
      guards: {
        'todo.create': canCreate,
        'workspace.members': canManage,
      },
      extend: async () => ({
        plan: 'pro',
      }),
    })

    await expect(query.handler({})).resolves.toEqual({
      userId: 'alice',
      tenantId: 'workspace-1',
      role: 'admin',
      can: {
        'todo.create': true,
        'workspace.members': false,
      },
      plan: 'pro',
    })
  })

  it('fails closed when a guard throws a ConvexError', async () => {
    const query = definePermissionContext({
      resolve: async () => ({ userId: 'alice', role: 'member' }),
      guards: {
        forbidden: () => {
          throw new ConvexError({ message: 'nope' })
        },
      },
    })

    await expect(query.handler({})).resolves.toEqual({
      userId: 'alice',
      tenantId: null,
      role: 'member',
      can: {
        forbidden: false,
      },
    })
  })

  it('returns a public definition that app.query can consume directly', async () => {
    const query = definePermissionContext({
      resolve: async () => ({
        userId: 'alice',
        tenantId: 'workspace-1',
        role: 'owner',
        plan: 'pro',
      }),
      guards: {
        'todo.create': true,
        'workspace.members': true,
      },
      extend: async () => ({
        plan: 'pro',
      }),
    })

    expect(query.guard).toBe(open)
    await expect(query.handler({})).resolves.toEqual({
      userId: 'alice',
      tenantId: 'workspace-1',
      role: 'owner',
      can: {
        'todo.create': true,
        'workspace.members': true,
      },
      plan: 'pro',
    })
  })

  it('rejects reserved permission context keys from extend at runtime', async () => {
    const query = definePermissionContext({
      resolve: async () => ({
        userId: 'alice',
        tenantId: 'workspace-1',
        role: 'owner',
      }),
      guards: {
        'todo.create': true,
      },
      extend: async () =>
        ({
          can: {
            'todo.create': false,
          },
        }) as unknown as Record<string, unknown>,
    })

    await expect(query.handler({})).rejects.toThrow(
      'definePermissionContext.extend() cannot return reserved key "can".',
    )
  })
})
