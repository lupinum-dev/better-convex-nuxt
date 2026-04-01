import { authorize, deny } from 'better-convex-nuxt/auth'
import { v } from 'convex/values'
import { mutation, query } from './_generated/server'

import { createMcpKey, revokeMcpKey } from '../shared/schemas/mcp-key'
import { getActor } from './auth/actor'
import { canIssueKeyRole, canManageMcpKeys } from './auth/checks'
import { loadResource } from './auth/scope'

const TOUCH_DEBOUNCE_MS = 60_000

export const list = query({
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx)
    authorize(actor, 'Manage MCP keys', canManageMcpKeys)

    const keys = await ctx.db
      .query('mcpKeys')
      .withIndex('by_workspace', q => q.eq('workspaceId', actor.tenantId))
      .order('desc')
      .collect()

    return keys.map(({ hash: _hash, ...key }) => key)
  },
})

export const create = mutation({
  args: createMcpKey.args,
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    authorize(actor, 'Manage MCP keys', canManageMcpKeys)

    if (!canIssueKeyRole(actor, args.role)) {
      throw deny('You cannot issue an MCP key with that role.')
    }

    return await ctx.db.insert('mcpKeys', {
      name: args.name,
      prefix: args.prefix,
      hash: args.hash,
      role: args.role,
      userId: actor.userId,
      workspaceId: actor.tenantId,
      status: 'active',
      createdAt: Date.now(),
    })
  },
})

export const revoke = mutation({
  args: revokeMcpKey.args,
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    authorize(actor, 'Manage MCP keys', canManageMcpKeys)

    const key = loadResource(actor, await ctx.db.get(args.id), 'MCP key')
    if (!canIssueKeyRole(actor, key.role)) {
      throw deny('You cannot revoke an MCP key with that role.')
    }

    await ctx.db.patch(args.id, {
      status: 'revoked',
      revokedAt: Date.now(),
    })
  },
})

export const validate = query({
  args: {
    hash: createMcpKey.args.hash,
  },
  handler: async (ctx, args) => {
    const key = await ctx.db
      .query('mcpKeys')
      .withIndex('by_hash', q => q.eq('hash', args.hash))
      .first()

    if (!key || key.status !== 'active') return null

    return {
      id: key._id,
      role: key.role,
      userId: key.userId,
      tenantId: key.workspaceId,
      lastUsedAt: key.lastUsedAt ?? null,
    }
  },
})

export const touch = mutation({
  args: {
    id: v.id('mcpKeys'),
    seenAt: v.number(),
  },
  handler: async (ctx, args) => {
    const key = await ctx.db.get(args.id)
    if (!key || key.status !== 'active') return

    const lastUsedAt = typeof key.lastUsedAt === 'number' ? key.lastUsedAt : 0
    if (args.seenAt - lastUsedAt < TOUCH_DEBOUNCE_MS) return

    await ctx.db.patch(args.id, {
      lastUsedAt: args.seenAt,
    })
  },
})
