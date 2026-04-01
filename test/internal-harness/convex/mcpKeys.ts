import { enforce } from 'better-convex-nuxt/auth'
import { v } from 'convex/values'

import type { Id } from './_generated/dataModel'
import { mutation, query } from './_generated/server'
import { getActor } from './auth/actor'
import { canInviteMembers } from './auth/checks'
import { loadResource } from './auth/scope'

function generateKey(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = 'mcp_'
  for (let i = 0; i < 32; i++) {
    result += chars[Math.floor(Math.random() * chars.length)]
  }
  return result
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx)
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

export const create = mutation({
  args: {
    name: v.string(),
    role: v.union(v.literal('owner'), v.literal('admin'), v.literal('member'), v.literal('viewer')),
  },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    enforce(actor, 'Create MCP key', canInviteMembers)
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

export const revoke = mutation({
  args: { id: v.id('mcpKeys') },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    enforce(actor, 'Revoke MCP key', canInviteMembers)
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
