import { v } from 'convex/values'
import type { Id } from './_generated/dataModel'

import {
  openQuery,
  publicMutation,
  publicQuery,
  scopedMutation,
} from './functions'

function generateKey(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = 'mcp_'
  for (let i = 0; i < 32; i++) {
    result += chars[Math.floor(Math.random() * chars.length)]
  }
  return result
}

export const list = openQuery({
  args: {},
  handler: async ({ actor, db }) => {
    if (!actor?.tenantId) return []
    const tenantId = actor.tenantId as Id<'organizations'>

    return await db
      .query('mcpKeys')
      .withIndex('by_organization', q => q.eq('organizationId', tenantId))
      .order('desc')
      .collect()
  },
})

export const create = scopedMutation({
  args: {
    name: v.string(),
    role: v.union(
      v.literal('owner'),
      v.literal('admin'),
      v.literal('member'),
      v.literal('viewer'),
    ),
  },
  handler: async ({ db, actor }, args) => {
    const key = generateKey()
    const prefix = key.slice(0, 12) + '...'

    const id = await db.insert('mcpKeys', {
      name: args.name,
      key,
      prefix,
      role: args.role,
      userId: actor.userId,
      status: 'active',
      createdAt: Date.now(),
    })

    return { id, key }
  },
})

export const revoke = scopedMutation({
  args: { id: v.id('mcpKeys') },
  resource: (args) => args.id,
  handler: async ({ db }, args) => {
    await db.patch(args.id, {
      status: 'revoked',
      revokedAt: Date.now(),
    })
  },
})

export const validate = publicQuery({
  args: { key: v.string() },
  handler: async ({ db }, args) => {
    const mcpKey = await db
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

export const touch = publicMutation({
  args: { key: v.string() },
  handler: async ({ db }, args) => {
    const mcpKey = await db
      .query('mcpKeys')
      .withIndex('by_key', (q) => q.eq('key', args.key))
      .first()

    if (mcpKey && mcpKey.status === 'active') {
      await db.patch(mcpKey._id, { lastUsedAt: Date.now() })
    }
  },
})
