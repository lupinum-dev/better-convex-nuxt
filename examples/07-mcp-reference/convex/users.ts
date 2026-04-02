import { open } from 'better-convex-nuxt/auth'

import { canIssueKeyRole, canManageMcpKeys } from './auth/checks'
import { app } from './functions'

export const getCurrentUser = app.query({
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

export const listWorkspaceUsersForMcpKeys = app.query({
  guard: canManageMcpKeys,
  args: {},
  handler: async (ctx) => {
    const actor = await ctx.actor()

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
