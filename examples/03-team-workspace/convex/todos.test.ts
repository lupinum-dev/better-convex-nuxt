/**
 * Why this file exists:
 * Example 03 is meant to prove the safety model, not just describe it.
 * These tests exercise tenant isolation, ownership rules, and principal-forwarding parity against
 * the same scoped handlers used by the browser UI and the MCP tools.
 */
/// <reference types="vite/client" />

import { createTestContext } from '@lupinum/trellis/testing'
import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { teamWorkspacePermissionKeys } from '../shared/permissions'
import { ensureNotProcessed, markProcessed } from './auth/idempotency'
import { ensureWebhookBotUser } from './auth/trustedCaller'
import schema from './schema'
import { modules } from './test.setup'

const api = anyApi
const TRUSTED_CALLER_KEY = 'test-trusted-caller-key'

function createCtx() {
  return createTestContext({ schema, modules, trustedCallerKey: TRUSTED_CALLER_KEY })
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

  it('applies the same permission rules to forwarded principals', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Alpha',
      users: {
        viewer: { role: 'viewer' },
      },
    })

    const trustedCaller = ctx.asPrincipal({
      kind: 'user',
      userId: team.users.viewer.authId,
    })

    await expect(
      trustedCaller.mutation(api.todos.create, {
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

    expect(ownerCtx?.can[teamWorkspacePermissionKeys.todoCreate]).toBe(true)
    expect(viewerCtx?.can[teamWorkspacePermissionKeys.todoCreate]).toBe(false)
    expect(viewerCtx?.can[teamWorkspacePermissionKeys.todoRead]).toBe(true)
  })

  it('returns null context and denies protected todo queries for anonymous callers', async () => {
    const ctx = createCtx()

    await expect(ctx.raw.query(api.workspaces.getPermissionContext, {})).resolves.toBeNull()
    await expect(ctx.raw.query(api.todos.list, {})).rejects.toThrow('Forbidden: Read todos')
  })

  it('returns onboarding permission context for signed-in users without a workspace', async () => {
    const ctx = createCtx()
    const now = Date.now()
    const authId = 'onboarding-user'

    await ctx.raw.run(async (innerCtx) => {
      await innerCtx.db.insert('users', {
        authId,
        role: 'member',
        email: 'onboarding@example.test',
        displayName: 'Onboarding User',
        createdAt: now,
        updatedAt: now,
      })
    })

    const onboardingUser = ctx.raw.withIdentity({ subject: authId })
    const permissionCtx = await onboardingUser.query(api.workspaces.getPermissionContext, {})

    expect(permissionCtx).toMatchObject({
      userId: authId,
      role: 'member',
      tenantId: null,
      email: 'onboarding@example.test',
      displayName: 'Onboarding User',
    })
    expect(permissionCtx?.can[teamWorkspacePermissionKeys.todoCreate]).toBe(false)
    expect(permissionCtx?.can[teamWorkspacePermissionKeys.todoRead]).toBe(false)
  })
})

describe('webhook idempotency', () => {
  async function seedWebhookBot(ctx: ReturnType<typeof createCtx>, workspaceId: string) {
    await ctx.raw.run(async (innerCtx) => {
      await ensureWebhookBotUser(innerCtx as never, workspaceId as never)
    })
  }

  it('denies an invalid trusted caller key', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Alpha',
      users: { owner: { role: 'owner' } },
    })

    await seedWebhookBot(ctx, team.id)

    await expect(
      ctx.raw.mutation(api.webhooks.processTodoSyncWebhook, {
        trustedCallerKey: 'wrong-key',
        workspaceId: team.id,
        eventId: 'evt-1',
        title: 'Synced todo',
      }),
    ).rejects.toThrow('Invalid trusted caller key.')
  })

  it('denies duplicate webhook events', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Alpha',
      users: { owner: { role: 'owner' } },
    })

    await seedWebhookBot(ctx, team.id)

    await ctx.raw.mutation(api.webhooks.processTodoSyncWebhook, {
      trustedCallerKey: TRUSTED_CALLER_KEY,
      workspaceId: team.id,
      eventId: 'evt-duplicate',
      title: 'First sync',
    })

    await expect(
      ctx.raw.mutation(api.webhooks.processTodoSyncWebhook, {
        trustedCallerKey: TRUSTED_CALLER_KEY,
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

    await seedWebhookBot(ctx, team.id)

    await ctx.raw.mutation(api.webhooks.processTodoSyncWebhook, {
      trustedCallerKey: TRUSTED_CALLER_KEY,
      workspaceId: team.id,
      eventId: 'evt-visible',
      title: 'Webhook todo',
    })

    const todos = await team.users.member.query(api.todos.list, {})
    expect(todos).toHaveLength(1)
    expect(todos[0]?.title).toBe('Webhook todo')
    expect(todos[0]?.source).toBe('webhook')
  })
})
