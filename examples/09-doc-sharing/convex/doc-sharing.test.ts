/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { describe, expect, it, vi } from 'vitest'

import { createTestContext } from 'better-convex-nuxt/testing'

import schema from './schema'
import { modules } from './test.setup'

const api = anyApi

vi.mock('./_generated/server', async () => {
  const server = await import('convex/server')
  return {
    query: server.query,
    mutation: server.mutation,
    action: server.action,
    internalQuery: server.internalQuery,
    internalMutation: server.internalMutation,
    internalAction: server.internalAction,
    httpAction: server.httpAction,
  }
})

function createCtx() {
  return createTestContext({
    schema,
    modules,
    tenant: {
      table: 'workspaces',
      field: 'workspaceId',
    },
    users: {
      table: 'users',
      authField: 'authId',
      roleField: 'role',
      tenantField: 'workspaceId',
      nameField: 'displayName',
      emailField: 'email',
    },
  })
}

describe('doc sharing example', () => {
  it('lets a workspace member use the normal workspace path', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Docs',
      users: {
        owner: { role: 'owner' },
      },
    })

    const seeded = await team.users.owner.mutation(api.pages.seedDemoPages, {})
    const page = await team.users.owner.query(api.pages.viewPage, { id: seeded.rootPageId })
    expect(page._via).toBe('workspace')
  })

  it('denies an expired token', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Docs',
      users: {
        owner: { role: 'owner' },
      },
    })

    const seeded = await team.users.owner.mutation(api.pages.seedDemoPages, {})
    await ctx.seed('shareTokens', {
      workspaceId: team.id,
      pageId: seeded.rootPageId,
      token: 'expired-token',
      level: 'view',
      expiresAt: Date.now() - 1000,
      createdAt: Date.now(),
    })

    await expect(
      ctx.raw.query(api.pages.viewPage, { id: seeded.rootPageId, shareToken: 'expired-token' }),
    ).rejects.toThrow('Link expired.')
  })

  it('denies token level mismatch for comments', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Docs',
      users: {
        owner: { role: 'owner' },
      },
    })

    const seeded = await team.users.owner.mutation(api.pages.seedDemoPages, {})
    await ctx.seed('shareTokens', {
      workspaceId: team.id,
      pageId: seeded.rootPageId,
      token: 'view-only',
      level: 'view',
      createdAt: Date.now(),
    })

    await expect(
      ctx.raw.mutation(api.pages.commentWithToken, {
        pageId: seeded.rootPageId,
        shareToken: 'view-only',
        body: 'Hello',
      }),
    ).rejects.toThrow('This link only allows view.')
  })

  it('inherits access from a parent page share', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Docs',
      users: {
        owner: { role: 'owner' },
        viewer: { role: 'viewer' },
      },
    })

    const seeded = await team.users.owner.mutation(api.pages.seedDemoPages, {})
    await ctx.seed('pageShares', {
      workspaceId: team.id,
      pageId: seeded.rootPageId,
      userId: team.users.viewer.authId,
      level: 'view',
      createdAt: Date.now(),
    })

    const page = await team.users.viewer.query(api.pages.viewPage, {
      id: seeded.childPageId,
    })
    expect(page.title).toBe('Pricing notes')
  })
})
