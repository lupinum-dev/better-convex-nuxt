import { executeOperationRef, previewOperationRef } from '@lupinum/trellis/functions'

import { api } from '../../../convex/_generated/api'
import { postDeletePermission } from '../../../convex/auth/permissions'
import { removePostOp } from '../../../convex/posts'
import { tool } from '../runtime'

const removeWithConfirmationRef = executeOperationRef(
  removePostOp,
  Object.create(api.posts.removeWithConfirmation),
)
const previewRemoveRef = previewOperationRef(removePostOp, Object.create(api.posts.previewRemove))

export default tool.fromOperation(removePostOp, {
  execute: removeWithConfirmationRef,
  preview: previewRemoveRef,
  permission: postDeletePermission,
  meta: {
    name: 'delete-post',
  },
  respond: ({ args, ok }) => {
    const request = args as { id: string }
    return ok({ deleted: true, id: request.id })
  },
})
