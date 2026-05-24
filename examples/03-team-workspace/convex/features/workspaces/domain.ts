import { authRequired } from '@lupinum/trellis/auth'

import { createWorkspace } from '../../../shared/features/workspaces/contract'
import type { Id } from '../../_generated/dataModel'
import { mutation } from '../../functions'

export const createWorkspaceMutation = mutation.protected({
  guard: authRequired,
  args: createWorkspace.args,
  handler: async (ctx, args) => {
    const caller = await ctx.caller()
    if (caller.kind !== 'user' && caller.kind !== 'agent') {
      throw new Error('Workspace creation requires a signed-in user caller.')
    }

    const existing = await ctx.db
      .query('workspaces')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .first()

    if (existing) throw new Error('That workspace slug is already taken.')

    const user =
      caller.kind === 'user'
        ? await ctx.db
            .query('users')
            .withIndex('by_auth_key', (q) => q.eq('authKey', caller.authKey))
            .first()
        : await ctx.db.get(caller.userId as Id<'users'>)

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
      workspaceId: workspaceId,
      role: 'owner',
      updatedAt: now,
    })

    return workspaceId
  },
})
