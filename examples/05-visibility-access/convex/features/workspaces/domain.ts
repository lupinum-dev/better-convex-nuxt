import { authRequired } from '@lupinum/trellis/auth'

import { createWorkspace } from '../../../shared/features/workspaces/contract'
import { mutation } from '../../functions'

export const createWorkspaceMutation = mutation.protected({
  guard: authRequired,
  args: createWorkspace.args,
  handler: async (ctx, args) => {
    const caller = (await ctx.caller()) as { authKey: string }

    const existing = await ctx.db
      .query('workspaces')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .first()
    if (existing) throw new Error('That workspace slug is already taken.')

    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_key', (q) => q.eq('authKey', caller.authKey))
      .first()
    if (!user) throw new Error('Current user row not found.')

    const now = Date.now()
    const workspaceId = await ctx.db.insert('workspaces', {
      name: args.name,
      slug: args.slug,
      ownerId: user._id,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.patch(user._id, {
      workspaceId,
      role: 'owner',
      updatedAt: now,
    })

    return workspaceId
  },
})
