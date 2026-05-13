import { query } from '../../functions'
import { canIssueKeyRole, mcpManage } from '../mcpKeys'

export const getCurrentUser = query.public({
  args: {},
  handler: async (ctx) => {
    const appIdentity = await ctx.appIdentity()
    if (!appIdentity) return null

    return await ctx.db
      .query('users')
      .withIndex('by_auth_id', (q) => q.eq('authId', appIdentity.userId))
      .first()
  },
})

export const listWorkspaceUsersForMcpKeys = query.protected({
  guard: mcpManage,
  args: {},
  handler: async (ctx) => {
    const appIdentity = await ctx.appIdentity()

    const users = await ctx.db.query('users').collect()

    return users
      .filter((user) => user.workspaceId === appIdentity.workspaceId)
      .filter((user) => canIssueKeyRole(appIdentity, user.role))
      .map((user) => ({
        authId: user.authId,
        displayName: user.displayName ?? null,
        email: user.email ?? null,
        role: user.role,
      }))
  },
})
