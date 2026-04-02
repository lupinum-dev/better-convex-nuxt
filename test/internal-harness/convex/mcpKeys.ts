import { v } from 'convex/values'

import type { Id } from './_generated/dataModel'
import { canInviteMembers } from './auth/checks'
import { loadResource } from './auth/scope'
import { app, mutation, query } from './functions'

function generateKey(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = 'mcp_'
  for (let i = 0; i < 32; i++) {
    result += chars[Math.floor(Math.random() * chars.length)]
  }
  return result
}

export const list = app.query({
  args: {},
  guard: (actor) => actor !== null,
  handler: async (ctx) => {
    const actor = await ctx.actor()
    if (!actor?.tenantId) return []

    return await ctx.db
      .query('mcpKeys')
      .withIndex('by_organization', (q) =>
        q.eq('organizationId', actor.tenantId as Id<'organizations'>),
      )
      .order('desc')
      .collect()
  },
})

export const create = app.mutation({
  args: {
    name: v.string(),
    role: v.union(v.literal('owner'), v.literal('admin'), v.literal('member'), v.literal('viewer')),
  },
  guard: canInviteMembers,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    if (!actor.tenantId) throw new Error('No organization selected')

    const key = generateKey()
    const prefix = key.slice(0, 12) + '...'

    const id = await ctx.db.insert('mcpKeys', {
      name: args.name,
      key,
      prefix,
      role: args.role,
      userId: actor.userId,
      organizationId: actor.tenantId as Id<'organizations'>,
      status: 'active',
      createdAt: Date.now(),
    })

    return { id, key }
  },
})

export const revoke = app.mutation({
  args: { id: v.id('mcpKeys') },
  guard: canInviteMembers,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    loadResource(actor, await ctx.db.get(args.id), 'MCP key')

    await ctx.db.patch(args.id, {
      status: 'revoked',
      revokedAt: Date.now(),
    })
  },
})

export const validate = query({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const mcpKey = await ctx.db
      .query('mcpKeys')
      .withIndex('by_key', (q) => q.eq('key', args.key))
      .first()

    if (!mcpKey || mcpKey.status !== 'active') return null

    return {
      role: mcpKey.role,
      userId: mcpKey.userId,
      tenantId: mcpKey.organizationId ?? null,
    }
  },
})

export const touch = mutation({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const mcpKey = await ctx.db
      .query('mcpKeys')
      .withIndex('by_key', (q) => q.eq('key', args.key))
      .first()

    if (mcpKey && mcpKey.status === 'active') {
      await ctx.db.patch(mcpKey._id, { lastUsedAt: Date.now() })
    }
  },
})
