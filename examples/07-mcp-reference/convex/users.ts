import { authorize } from 'better-convex-nuxt/auth'

import { query } from './_generated/server'
import { getActor } from './auth/actor'
import { canIssueKeyRole, canManageMcpKeys } from './auth/checks'

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx)
    if (!actor) return null

    return await ctx.db
      .query('users')
      .withIndex('by_auth_id', (q) => q.eq('authId', actor.userId))
      .first()
  },
})

export const listWorkspaceUsersForMcpKeys = query({
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx)
    authorize(actor, 'Manage MCP keys', canManageMcpKeys)

    const users = await ctx.db
      .query('users')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', actor.tenantId))
      .collect()

    return users
      .filter((user) => canIssueKeyRole(actor, user.role))
      .map((user) => ({
        authId: user.authId,
        displayName: user.displayName ?? null,
        email: user.email ?? null,
        role: user.role,
      }))
  },
})
