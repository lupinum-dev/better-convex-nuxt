import { enforce, deny } from 'better-convex-nuxt/auth'
import type { GenericMutationCtx, GenericQueryCtx } from 'convex/server'
import { v } from 'convex/values'

import { createMcpKey, revokeMcpKey } from '../shared/schemas/mcp-key'
import type { DataModel, Doc } from './_generated/dataModel'
import { mutation, query } from './_generated/server'
import { getActor } from './auth/actor'
import { canIssueKeyRole, canManageMcpKeys } from './auth/checks'

const TOUCH_DEBOUNCE_MS = 60_000

type BoundUser = Pick<Doc<'users'>, 'authId' | 'displayName' | 'email' | 'role' | 'workspaceId'>
type McpKeyDoc = Doc<'mcpKeys'>
type Ctx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>
type KeyUsability = 'usable' | 'revoked' | 'bound_user_missing' | 'bound_user_workspace_mismatch'

async function getBoundUser(ctx: Ctx, boundAuthId: string): Promise<BoundUser | null> {
  const user = await ctx.db
    .query('users')
    .withIndex('by_auth_id', (q) => q.eq('authId', boundAuthId))
    .first()

  return user ?? null
}

function getKeyUsability(key: McpKeyDoc, boundUser: BoundUser | null): KeyUsability {
  if (key.status === 'revoked') return 'revoked'
  if (!boundUser?.workspaceId) return 'bound_user_missing'
  if (boundUser.workspaceId !== key.boundWorkspaceId) return 'bound_user_workspace_mismatch'
  return 'usable'
}

function toListedKey(key: McpKeyDoc, boundUser: BoundUser | null) {
  return {
    _id: key._id,
    _creationTime: key._creationTime,
    name: key.name,
    prefix: key.prefix,
    boundAuthId: key.boundAuthId,
    boundWorkspaceId: key.boundWorkspaceId,
    issuedByAuthId: key.issuedByAuthId,
    status: key.status,
    createdAt: key.createdAt,
    lastUsedAt: key.lastUsedAt,
    revokedAt: key.revokedAt,
    effectiveRole: boundUser?.role ?? null,
    usability: getKeyUsability(key, boundUser),
    boundUser: boundUser
      ? {
          authId: boundUser.authId,
          displayName: boundUser.displayName ?? null,
          email: boundUser.email ?? null,
          role: boundUser.role,
        }
      : null,
  }
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx)
    enforce(actor, 'Manage MCP keys', canManageMcpKeys)

    const keys = await ctx.db
      .query('mcpKeys')
      .withIndex('by_bound_workspace', (q) => q.eq('boundWorkspaceId', actor.tenantId))
      .order('desc')
      .collect()

    return await Promise.all(
      keys.map(async (key) => toListedKey(key, await getBoundUser(ctx, key.boundAuthId))),
    )
  },
})

export const create = mutation({
  args: createMcpKey.args,
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    enforce(actor, 'Manage MCP keys', canManageMcpKeys)

    const boundUser = await getBoundUser(ctx, args.boundAuthId)
    if (!boundUser?.workspaceId || boundUser.workspaceId !== actor.tenantId) {
      throw deny('You can only issue MCP keys for users in your workspace.')
    }
    if (!canIssueKeyRole(actor, boundUser.role)) {
      throw deny('You cannot issue an MCP key for that user.')
    }

    return await ctx.db.insert('mcpKeys', {
      name: args.name,
      prefix: args.prefix,
      hash: args.hash,
      boundAuthId: boundUser.authId,
      boundWorkspaceId: actor.tenantId,
      issuedByAuthId: actor.userId,
      status: 'active',
      createdAt: Date.now(),
    })
  },
})

export const revoke = mutation({
  args: revokeMcpKey.args,
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    enforce(actor, 'Manage MCP keys', canManageMcpKeys)

    const rawKey = await ctx.db.get(args.id)
    if (!rawKey || rawKey.boundWorkspaceId !== actor.tenantId) {
      throw deny('MCP key not found.')
    }

    const boundUser = await getBoundUser(ctx, rawKey.boundAuthId)
    if (
      boundUser?.workspaceId &&
      boundUser.workspaceId === rawKey.boundWorkspaceId &&
      !canIssueKeyRole(actor, boundUser.role)
    ) {
      throw deny('You cannot revoke an MCP key for that user.')
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
      .withIndex('by_hash', (q) => q.eq('hash', args.hash))
      .first()

    if (!key || key.status !== 'active') return null
    const boundUser = await getBoundUser(ctx, key.boundAuthId)
    if (!boundUser?.workspaceId || boundUser.workspaceId !== key.boundWorkspaceId) return null

    return {
      id: key._id,
      role: boundUser.role,
      userId: boundUser.authId,
      tenantId: boundUser.workspaceId,
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
