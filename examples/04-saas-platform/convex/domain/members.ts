import { projectRead } from '../auth/permissions'

import { requireWorkspaceTenant } from '../auth/checks'
import { query } from '../functions'

export const list = query({
  args: {},
  guard: projectRead,
  handler: async (ctx) => {
    const actor = await ctx.actor()
    const workspaceId = requireWorkspaceTenant(actor)

    const users = await ctx.db.query('users').order('asc').collect()
    return users.filter((user) => user.workspaceId === workspaceId)
  },
})
