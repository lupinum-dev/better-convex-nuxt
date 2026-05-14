import { defineGuard } from '@lupinum/trellis/auth'

import { createComment } from '../shared/schemas/comment'
import type { AppIdentity } from './auth/appIdentity'
import { canCreateComment } from './auth/checks'
import { loadResource } from './auth/scope'
import { mutation } from './functions'

const canCreateScopedComment = defineGuard<AppIdentity>(
  'comment.create',
  (appIdentity) => !!appIdentity?.workspaceId && canCreateComment(appIdentity),
)

export const create = mutation.protected({
  args: createComment.args,
  guard: canCreateScopedComment,
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    if (!appIdentity.workspaceId) throw new Error('No organization selected')
    const post = loadResource(appIdentity, await ctx.db.get(args.postId), 'Post')

    return await ctx.db.insert('comments', {
      postId: args.postId,
      content: args.content,
      ownerId: appIdentity.userId,
      organizationId: post.organizationId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  },
})
