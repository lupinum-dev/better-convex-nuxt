import { ConvexError } from 'convex/values'
import { describe, expect, it } from 'vitest'

import { defineGuard } from '../../src/runtime/auth'
import { definePermissionContext } from '../../src/runtime/auth/define-permission-context'
import { definePermissions } from '../../src/runtime/auth/define-permissions'

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

  it('keeps legacy definePermissions behavior stable', async () => {
    const query = definePermissions({
      resolve: async () => ({
        userId: 'alice',
        tenantId: 'workspace-1',
        role: 'owner',
        plan: 'pro',
      }),
      can: () => ({
        'todo.create': true,
        'workspace.members': true,
      }),
      context: async () => ({
        plan: 'pro',
      }),
    })

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
})
