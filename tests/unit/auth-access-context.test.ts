import { ConvexError } from 'convex/values'
import { describe, expect, it } from 'vitest'

import { defineGuard, definePermission, open } from '../../src/runtime/auth'
import { defineAccessContext } from '../../src/runtime/auth/define-access-context'

describe('access context primitives', () => {
  it('builds a access context from permission definitions', async () => {
    const canCreate = definePermission({
      key: 'todo.create',
      check: defineGuard<{ userId: string; role: string }>(
        'todo.create',
        (appIdentity) => appIdentity.role !== 'viewer',
      ),
    })
    const canManage = definePermission({
      key: 'workspace.members',
      check: defineGuard<{ userId: string; role: string }>(
        'workspace.members',
        (appIdentity) => appIdentity.role === 'owner',
      ),
    })

    const query = defineAccessContext({
      resolve: async () => ({
        userId: 'alice',
        workspaceId: 'workspace-1',
        role: 'admin',
        plan: 'pro',
      }),
      permissions: [canCreate, canManage],
      extend: async () => ({
        plan: 'pro',
      }),
    })

    await expect(query.handler({})).resolves.toEqual({
      userId: 'alice',
      workspaceId: 'workspace-1',
      role: 'admin',
      can: {
        'todo.create': true,
        'workspace.members': false,
      },
      plan: 'pro',
    })
  })

  it('fails closed when a guard throws a ConvexError', async () => {
    const query = defineAccessContext({
      resolve: async () => ({ userId: 'alice', role: 'member' }),
      permissions: [
        definePermission({
          key: 'forbidden',
          check: () => {
            throw new ConvexError({ message: 'nope' })
          },
        }),
      ],
    })

    await expect(query.handler({})).resolves.toEqual({
      userId: 'alice',
      workspaceId: null,
      role: 'member',
      can: {
        forbidden: false,
      },
    })
  })

  it('returns a public definition that app.query can consume directly', async () => {
    const query = defineAccessContext({
      resolve: async () => ({
        userId: 'alice',
        workspaceId: 'workspace-1',
        role: 'owner',
        plan: 'pro',
      }),
      permissions: [
        definePermission({ key: 'todo.create', check: true }),
        definePermission({ key: 'workspace.members', check: true }),
      ],
      extend: async () => ({
        plan: 'pro',
      }),
    })

    expect(query.guard).toBe(open)
    await expect(query.handler({})).resolves.toEqual({
      userId: 'alice',
      workspaceId: 'workspace-1',
      role: 'owner',
      can: {
        'todo.create': true,
        'workspace.members': true,
      },
      plan: 'pro',
    })
  })

  it('rejects reserved access context keys from extend at runtime', async () => {
    const query = defineAccessContext({
      resolve: async () => ({
        userId: 'alice',
        workspaceId: 'workspace-1',
        role: 'owner',
      }),
      permissions: [definePermission({ key: 'todo.create', check: true })],
      extend: async () =>
        ({
          can: {
            'todo.create': false,
          },
        }) as unknown as Record<string, unknown>,
    })

    await expect(query.handler({})).rejects.toThrow(
      'defineAccessContext.extend() cannot return reserved key "can".',
    )
  })
})
