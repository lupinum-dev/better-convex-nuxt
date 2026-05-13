import { listMembers } from '../../../shared/features/members/contract'
import { requireWorkspaceTenant } from '../../auth/guards'
import { query } from '../../functions'
import { projectRead } from '../projects'

export const list = query.protected({
  args: listMembers.args,
  guard: projectRead,
  handler: async (ctx) => {
    const appIdentity = await ctx.appIdentity()
    const workspaceId = requireWorkspaceTenant(appIdentity)

    const users = await ctx.db.query('users').order('asc').collect()
    return users.filter((user) => user.workspaceId === workspaceId)
  },
})
