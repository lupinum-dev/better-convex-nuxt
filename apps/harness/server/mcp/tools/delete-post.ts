import { postDeletePermission } from '../../../convex/auth/permissions'
import { previewRemove, removePostOp, removeWithConfirmation } from '../../../convex/posts'
import { tool } from '../runtime'

export default tool.fromOperation(removePostOp, {
  execute: removeWithConfirmation,
  preview: previewRemove,
  permission: postDeletePermission,
  meta: {
    name: 'delete-post',
  },
  respond: ({ args, ok }) => {
    const request = args as { id: string }
    return ok({ deleted: true, id: request.id })
  },
})
