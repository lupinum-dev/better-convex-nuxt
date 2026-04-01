/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { createTestContext } from 'better-convex-nuxt/testing'

import type { Id } from './_generated/dataModel'
import { hashShareToken, shareTokenPrefix } from './auth/shareTokens'
import schema from './schema'
import { modules } from './test.setup'

const api = anyApi

function createCtx() {
  return createTestContext({ schema, modules })
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

  it('lets the page owner read a private page without a separate share row', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Docs',
      users: {
        member: { role: 'member' },
      },
    })

    const seeded = await team.users.member.mutation(api.pages.seedDemoPages, {})
    const page = await team.users.member.query(api.pages.viewPage, { id: seeded.childPageId })
    expect(page._access).toBe('edit')
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
    const workspaceId = team.id as Id<'workspaces'>
    await ctx.seed('shareTokens', {
      workspaceId,
      pageId: seeded.rootPageId,
      prefix: shareTokenPrefix('expired-token'),
      hash: await hashShareToken('expired-token'),
      level: 'view',
      expiresAt: Date.now() - 1000,
      createdAt: Date.now(),
    })

    await expect(
      ctx.raw.query(api.pages.viewPage, { id: seeded.rootPageId, shareToken: 'expired-token' }),
    ).rejects.toThrow('Link expired.')
  })

  it('denies a revoked token', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Docs',
      users: {
        owner: { role: 'owner' },
      },
    })

    const seeded = await team.users.owner.mutation(api.pages.seedDemoPages, {})
    const workspaceId = team.id as Id<'workspaces'>
    await ctx.seed('shareTokens', {
      workspaceId,
      pageId: seeded.rootPageId,
      prefix: shareTokenPrefix('revoked-token'),
      hash: await hashShareToken('revoked-token'),
      level: 'view',
      revokedAt: Date.now() - 1000,
      createdAt: Date.now(),
    })

    await expect(
      ctx.raw.query(api.pages.viewPage, { id: seeded.rootPageId, shareToken: 'revoked-token' }),
    ).rejects.toThrow('Link has been revoked.')
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
    const workspaceId = team.id as Id<'workspaces'>
    await ctx.seed('shareTokens', {
      workspaceId,
      pageId: seeded.rootPageId,
      prefix: shareTokenPrefix('view-only'),
      hash: await hashShareToken('view-only'),
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
    const workspaceId = team.id as Id<'workspaces'>
    await ctx.seed('pageShares', {
      workspaceId,
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

  it('denies token reuse against a different page id', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Docs',
      users: {
        owner: { role: 'owner' },
      },
    })

    const seeded = await team.users.owner.mutation(api.pages.seedDemoPages, {})
    const token = await team.users.owner.mutation(api.pages.createShareToken, {
      pageId: seeded.rootPageId,
      level: 'view',
    })

    await expect(
      ctx.raw.query(api.pages.viewPage, {
        id: seeded.childPageId,
        shareToken: token,
      }),
    ).rejects.toThrow('Token does not match this page.')
  })

  it('stores only a hash for new share tokens', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Docs',
      users: {
        owner: { role: 'owner' },
      },
    })

    const seeded = await team.users.owner.mutation(api.pages.seedDemoPages, {})
    const token = await team.users.owner.mutation(api.pages.createShareToken, {
      pageId: seeded.rootPageId,
      level: 'view',
    })

    const records = await ctx.readAll('shareTokens')
    expect(records).toHaveLength(1)
    expect(records[0]?.prefix).toBe(shareTokenPrefix(token))
    expect(records[0]?.hash).toBe(await hashShareToken(token))
    expect('token' in (records[0] ?? {})).toBe(false)
  })

  it('returns permission context booleans for owners and viewers', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Docs',
      users: {
        owner: { role: 'owner' },
        viewer: { role: 'viewer' },
      },
    })

    const ownerCtx = await team.users.owner.query(api.workspaces.getPermissionContext, {})
    const viewerCtx = await team.users.viewer.query(api.workspaces.getPermissionContext, {})

    expect(ownerCtx?.can['page.create']).toBe(true)
    expect(viewerCtx?.can['page.create']).toBe(false)
  })

  it('returns null context and rejects protected page queries for anonymous callers', async () => {
    const ctx = createCtx()

    await expect(ctx.raw.query(api.workspaces.getPermissionContext, {})).resolves.toBeNull()
    await expect(ctx.raw.query(api.pages.list, {})).rejects.toThrow('Forbidden: Read page')
  })
})
