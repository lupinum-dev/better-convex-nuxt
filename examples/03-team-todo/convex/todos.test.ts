/**
 * Why this file exists:
 * Example 03 is meant to prove the safety model, not just describe it.
 * These tests exercise tenant isolation, ownership rules, and service-auth parity against
 * the same scoped handlers used by the browser UI and the MCP tools.
 */
/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { createTestContext } from 'better-convex-nuxt/testing'

import schema from './schema'
import { modules } from './test.setup'
const api = anyApi

function createCtx() {
  return createTestContext({
    schema,
    modules,
    tenant: {
      table: 'workspaces',
      field: 'workspaceId',
    },
  })
}

describe('team todo example', () => {
  it('lets a member update their own todo', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Alpha',
      users: {
        alice: { role: 'member' },
      },
    })

    const todoId = await team.users.alice.mutation(api.todos.create, {
      title: 'Alice todo',
    })

    await team.users.alice.mutation(api.todos.setCompleted, {
      id: todoId,
      completed: true,
    })

    const todos = await team.users.alice.query(api.todos.list, {})
    expect(todos).toHaveLength(1)
    expect(todos[0]?.completed).toBe(true)
  })

  it('blocks a member from updating another member`s todo', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Alpha',
      users: {
        alice: { role: 'member' },
        bob: { role: 'member' },
      },
    })

    const todoId = await team.users.alice.mutation(api.todos.create, {
      title: 'Alice private team todo',
    })

    await expect(
      team.users.bob.mutation(api.todos.setCompleted, {
        id: todoId,
        completed: true,
      }),
    ).rejects.toThrow('Forbidden: Update todo')
  })

  it('keeps tenants isolated from each other', async () => {
    const ctx = createCtx()
    const alpha = await ctx.seedTenant({
      name: 'Alpha',
      users: {
        alice: { role: 'member' },
      },
    })
    const beta = await ctx.seedTenant({
      name: 'Beta',
      users: {
        bruno: { role: 'member' },
      },
    })

    await alpha.users.alice.mutation(api.todos.create, {
      title: 'Alpha only',
    })
    await beta.users.bruno.mutation(api.todos.create, {
      title: 'Beta only',
    })

    const alphaTodos = await alpha.users.alice.query(api.todos.list, {})
    const betaTodos = await beta.users.bruno.query(api.todos.list, {})

    expect(alphaTodos).toHaveLength(1)
    expect(alphaTodos[0]?.title).toBe('Alpha only')
    expect(betaTodos).toHaveLength(1)
    expect(betaTodos[0]?.title).toBe('Beta only')
  })

  it('applies the same permission rules to service-auth callers', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Alpha',
      users: {
        viewer: { role: 'viewer' },
      },
    })

    const service = ctx.asService({
      userId: team.users.viewer.authId,
      role: 'viewer',
      tenantId: team.id,
    })

    await expect(
      service.mutation(api.todos.create, {
        title: 'Should fail',
      }),
    ).rejects.toThrow('Forbidden: Create todo')
  })

  it('returns permission context booleans for contrasting roles', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Alpha',
      users: {
        owner: { role: 'owner' },
        viewer: { role: 'viewer' },
      },
    })

    const ownerCtx = await team.users.owner.query(api.workspaces.getPermissionContext, {})
    const viewerCtx = await team.users.viewer.query(api.workspaces.getPermissionContext, {})

    expect(ownerCtx?.can['todo.create']).toBe(true)
    expect(viewerCtx?.can['todo.create']).toBe(false)
    expect(viewerCtx?.can['todo.read']).toBe(true)
  })

  it('returns null context and denies protected todo queries for anonymous callers', async () => {
    const ctx = createCtx()

    await expect(ctx.raw.query(api.workspaces.getPermissionContext, {})).resolves.toBeNull()
    await expect(ctx.raw.query(api.todos.list, {})).rejects.toThrow('Forbidden: Read todos')
  })
})
