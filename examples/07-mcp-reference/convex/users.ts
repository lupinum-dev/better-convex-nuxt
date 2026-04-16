import { open } from '@lupinum/trellis/auth'

import { canIssueKeyRole, canManageMcpKeys } from './auth/checks'
import { mutation, query } from './functions'

export const getCurrentUser = query({
  guard: open,
  args: {},
  handler: async (ctx) => {
    const actor = await ctx.actor()
    if (!actor) return null

    return await ctx.db
      .query('users')
      .withIndex('by_auth_id', (q) => q.eq('authId', actor.userId))
      .first()
  },
})

export const listWorkspaceUsersForMcpKeys = query({
  guard: canManageMcpKeys,
  args: {},
  handler: async (ctx) => {
    const actor = await ctx.actor()

    const users = await ctx.db.query('users').collect()

    return users
      .filter((user) => user.workspaceId === actor.tenantId)
      .filter((user) => canIssueKeyRole(actor, user.role))
      .map((user) => ({
        authId: user.authId,
        displayName: user.displayName ?? null,
        email: user.email ?? null,
        role: user.role,
      }))
  },
})
