import { trellisOperationProjectionMetadataKey } from '@lupinum/trellis/functions'

import { api } from '../../../convex/_generated/api'
import { postDeletePermission } from '../../../convex/auth/permissions'
import { removePostOp } from '../../../convex/posts'
import { tool } from '../runtime'

function bindOperationProjection<T>(ref: T, projection: 'execute' | 'preview') {
  const bound = Object.create(ref as object)

  Object.defineProperty(bound, trellisOperationProjectionMetadataKey, {
    value: {
      operationId: 'posts.remove',
      projection,
    },
    enumerable: false,
    configurable: true,
    writable: false,
  })

  return bound as T
}

export default tool.fromOperation(removePostOp, {
  execute: bindOperationProjection(api.posts.removeWithConfirmation, 'execute'),
  preview: bindOperationProjection(api.posts.previewRemove, 'preview'),
  permission: postDeletePermission,
  meta: {
    name: 'delete-post',
  },
  respond: ({ args, ok }) => {
    const request = args as { id: string }
    return ok({ deleted: true, id: request.id })
  },
})
