/**
 * MCP Keys — API key management for MCP integrations.
 *
 * Keys are scoped to an organization and carry a role + userId identity.
 * The MCP auth middleware looks up the bearer token via the `validate` query.
 */

import { v } from 'convex/values'

import { query, mutation } from './_generated/server'
import { getUser } from './lib/permissions'

// ============================================
// Helpers
// ============================================

function generateKey(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = 'mcp_'
  for (let i = 0; i < 32; i++) {
    result += chars[Math.floor(Math.random() * chars.length)]
  }
  return result
}

// ============================================
// LIST — all keys for the user's org
// ============================================

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx)
    if (!user || !user.organizationId) return []

    return await ctx.db
      .query('mcpKeys')
      .withIndex('by_organization', (q) => q.eq('organizationId', user.organizationId))
      .order('desc')
      .collect()
  },
})

// ============================================
// CREATE — generate a new MCP key
// ============================================

export const create = mutation({
  args: {
    name: v.string(),
    role: v.union(
      v.literal('owner'),
      v.literal('admin'),
      v.literal('member'),
      v.literal('viewer'),
    ),
  },
  handler: async (ctx, args) => {
    const user = await getUser(ctx)
    if (!user) throw new Error('Authentication required')
    if (!user.organizationId) throw new Error('No organization')

    const key = generateKey()
    const prefix = key.slice(0, 12) + '...'

    const id = await ctx.db.insert('mcpKeys', {
      name: args.name,
      key,
      prefix,
      role: args.role,
      userId: user.authId,
      organizationId: user.organizationId,
      status: 'active',
      createdAt: Date.now(),
    })

    // Return the full key only on creation — it won't be shown again
    return { id, key }
  },
})

// ============================================
// REVOKE — disable a key
// ============================================

export const revoke = mutation({
  args: { id: v.id('mcpKeys') },
  handler: async (ctx, args) => {
    const user = await getUser(ctx)
    if (!user) throw new Error('Authentication required')

    const mcpKey = await ctx.db.get(args.id)
    if (!mcpKey) throw new Error('Key not found')
    if (mcpKey.organizationId !== user.organizationId) throw new Error('Not your key')

    await ctx.db.patch(args.id, {
      status: 'revoked',
      revokedAt: Date.now(),
    })
  },
})

// ============================================
// VALIDATE — called by the MCP auth middleware
// ============================================

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

// ============================================
// TOUCH — update lastUsedAt (called from middleware)
// ============================================

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
