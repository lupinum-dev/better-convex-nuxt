import { executeOperationRef, previewOperationRef } from '@lupinum/trellis/functions'

import { api } from '../../../convex/_generated/api'
import { postDeletePermission } from '../../../convex/auth/permissions'
import { removePostOp } from '../../../convex/posts'
import { tool } from '../runtime'

export default tool.fromOperation(removePostOp, {
  execute: executeOperationRef(removePostOp, api.posts.removeWithConfirmation),
  preview: previewOperationRef(removePostOp, api.posts.previewRemove),
  permission: postDeletePermission,
  meta: {
    name: 'delete-post',
  },
  respond: ({ args, ok }) => {
    const request = args as { id: string }
    return ok({ deleted: true, id: request.id })
  },
})
