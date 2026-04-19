import { api } from '../../../convex/_generated/api'
import { postDeletePermission } from '../../../convex/auth/permissions'
import { removePostOp } from '../../../convex/posts'
import { tool } from '../runtime'

export default tool.fromOperation(removePostOp, {
  execute: api.posts.removeWithConfirmation,
  preview: api.posts.previewRemove,
  permission: postDeletePermission,
  meta: {
    name: 'delete-post',
  },
  respond: ({ args, ok }) => {
    const request = args as { id: string }
    return ok({ deleted: true, id: request.id })
  },
})
