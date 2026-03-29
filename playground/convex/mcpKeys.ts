import { v } from 'convex/values'

import { query, mutation } from './_generated/server'
import {
  requireActor,
  serviceAuthArgs,
  tryResolveActor,
} from './lib/actor'

function generateKey(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = 'mcp_'
  for (let i = 0; i < 32; i++) {
    result += chars[Math.floor(Math.random() * chars.length)]
  }
  return result
}

export const list = query({
  args: { ...serviceAuthArgs },
  handler: async (ctx, args) => {
    const actor = await tryResolveActor(ctx, args)
    if (!actor?.orgId) return []

    return await ctx.db
      .query('mcpKeys')
      .withIndex('by_organization', (q) => q.eq('organizationId', actor.orgId as any))
      .order('desc')
      .collect()
  },
})

export const create = mutation({
  args: {
    name: v.string(),
    role: v.union(
      v.literal('owner'),
      v.literal('admin'),
      v.literal('member'),
      v.literal('viewer'),
    ),
    ...serviceAuthArgs,
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args)
    const key = generateKey()
    const prefix = key.slice(0, 12) + '...'

    const id = await ctx.db.insert('mcpKeys', {
      name: args.name,
      key,
      prefix,
      role: args.role,
      userId: actor.userId,
      organizationId: actor.orgId as any,
      status: 'active',
      createdAt: Date.now(),
    })

    return { id, key }
  },
})

export const revoke = mutation({
  args: { id: v.id('mcpKeys'), ...serviceAuthArgs },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args)
    const mcpKey = await ctx.db.get(args.id)
    if (!mcpKey) throw new Error('Key not found')
    if (mcpKey.organizationId !== actor.orgId) throw new Error('Not your key')

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
      orgId: mcpKey.organizationId ?? null,
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
