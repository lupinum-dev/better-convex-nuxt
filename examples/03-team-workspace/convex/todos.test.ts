/**
 * Why this file exists:
 * Example 03 is meant to prove the safety model, not just describe it.
 * These tests exercise isolation, ownership rules, and the small webhook boundary.
 */
/// <reference types="vite/client" />

import { createTestContext } from '@lupinum/trellis/testing'
import { describe, expect, it } from 'vitest'

import { api } from './_generated/api'
import { ensureNotProcessed, markProcessed } from './auth/idempotency'
import { todoCreate, todoRead } from './features/todos'
import schema from './schema'
import { modules } from './test.setup'

type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer'

function createCtx() {
  return createTestContext<typeof schema, WorkspaceRole>({
    schema,
    modules,
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

    const todoId = await team.users.alice.mutation(api.features.todos.domain.create, {
      title: 'Alice todo',
    })

    await team.users.alice.mutation(api.features.todos.domain.setCompleted, {
      id: todoId,
      completed: true,
    })

    const todos = await team.users.alice.query(api.features.todos.domain.list, {})
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

    const todoId = await team.users.alice.mutation(api.features.todos.domain.create, {
      title: 'Alice private team todo',
    })

    await expect(
      team.users.bob.mutation(api.features.todos.domain.setCompleted, {
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

    await alpha.users.alice.mutation(api.features.todos.domain.create, {
      title: 'Alpha only',
    })
    await beta.users.bruno.mutation(api.features.todos.domain.create, {
      title: 'Beta only',
    })

    const alphaTodos = await alpha.users.alice.query(api.features.todos.domain.list, {})
    const betaTodos = await beta.users.bruno.query(api.features.todos.domain.list, {})

    expect(alphaTodos).toHaveLength(1)
    expect(alphaTodos[0]?.title).toBe('Alpha only')
    expect(betaTodos).toHaveLength(1)
    expect(betaTodos[0]?.title).toBe('Beta only')
  })

  it('returns access context booleans for contrasting roles', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Alpha',
      users: {
        owner: { role: 'owner' },
        viewer: { role: 'viewer' },
      },
    })

    const ownerCtx = await team.users.owner.query(api.permissions.context.getAccessContext, {})
    const viewerCtx = await team.users.viewer.query(api.permissions.context.getAccessContext, {})

    expect(ownerCtx?.can[todoCreate.key]).toBe(true)
    expect(viewerCtx?.can[todoCreate.key]).toBe(false)
    expect(viewerCtx?.can[todoRead.key]).toBe(true)
  })

  it('returns null context and denies protected todo queries for anonymous callers', async () => {
    const ctx = createCtx()

    await expect(ctx.raw.query(api.permissions.context.getAccessContext, {})).resolves.toBeNull()
    await expect(ctx.raw.query(api.features.todos.domain.list, {})).rejects.toThrow(
      'Forbidden: Read todos',
    )
  })

  it('returns onboarding access context for signed-in users without a workspace', async () => {
    const ctx = createCtx()
    const now = Date.now()
    const authKey = 'onboarding-user'

    const userId = await ctx.raw.run(async (innerCtx) => {
      return await innerCtx.db.insert('users', {
        authKey,
        role: 'member',
        email: 'onboarding@example.test',
        displayName: 'Onboarding User',
        createdAt: now,
        updatedAt: now,
      })
    })

    const onboardingUser = ctx.raw.withIdentity({ subject: authKey, tokenIdentifier: authKey })
    const permissionCtx = await onboardingUser.query(api.permissions.context.getAccessContext, {})

    expect(permissionCtx).toMatchObject({
      userId,
      role: 'member',
      workspaceId: null,
      email: 'onboarding@example.test',
      displayName: 'Onboarding User',
    })
    expect(permissionCtx?.can[todoCreate.key]).toBe(false)
    expect(permissionCtx?.can[todoRead.key]).toBe(false)
  })
})

describe('webhook idempotency', () => {
  it('denies duplicate webhook events', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Alpha',
      users: { owner: { role: 'owner' } },
    })

    await team.users.owner.mutation(api.features.todos.webhooks.processTodoSyncWebhookMutation, {
      workspaceId: team.id,
      eventId: 'evt-duplicate',
      title: 'First sync',
    })

    await expect(
      team.users.owner.mutation(api.features.todos.webhooks.processTodoSyncWebhookMutation, {
        workspaceId: team.id,
        eventId: 'evt-duplicate',
        title: 'Duplicate sync',
      }),
    ).rejects.toThrow('Event already processed.')
  })

  it('treats source plus event id as the replay key', async () => {
    const ctx = createCtx()

    await ctx.raw.run(async (innerCtx) => {
      await markProcessed(innerCtx.db, 'evt-shared', 'webhook')
      await expect(
        ensureNotProcessed(innerCtx.db, 'erp-sync', 'evt-shared'),
      ).resolves.toBeUndefined()
      await expect(ensureNotProcessed(innerCtx.db, 'webhook', 'evt-shared')).rejects.toThrow(
        'Event already processed.',
      )
    })
  })

  it('webhook-created todos are visible in the workspace list', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Alpha',
      users: { member: { role: 'member' } },
    })

    await team.users.member.mutation(api.features.todos.webhooks.processTodoSyncWebhookMutation, {
      workspaceId: team.id,
      eventId: 'evt-visible',
      title: 'Webhook todo',
    })

    const todos = await team.users.member.query(api.features.todos.domain.list, {})
    expect(todos).toHaveLength(1)
    expect(todos[0]?.title).toBe('Webhook todo')
    expect(todos[0]?.source).toBe('webhook')
  })
})
