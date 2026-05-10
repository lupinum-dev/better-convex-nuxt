import { query } from '../../functions'
import { canIssueKeyRole, mcpManage } from '../mcpKeys'

export const getCurrentUser = query.public({
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

export const listWorkspaceUsersForMcpKeys = query.protected({
  guard: mcpManage,
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
