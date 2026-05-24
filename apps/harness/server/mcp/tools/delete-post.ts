import { executeOperationRef, previewOperationRef } from '@lupinum/trellis/backend'

import { api } from '../../../convex/_generated/api'
import { removePostDescriptor } from '../../../shared/schemas/post'
import { tool } from '../runtime'

const removeWithConfirmationRef = executeOperationRef(
  removePostDescriptor,
  Object.create(api.posts.removeWithConfirmation),
)
const previewRemoveRef = previewOperationRef(
  removePostDescriptor,
  Object.create(api.posts.previewRemove),
)

export default tool.operation(removePostDescriptor, {
  execute: removeWithConfirmationRef,
  preview: previewRemoveRef,
  previewOperation: 'mutation',
  meta: {
    name: 'delete-post',
  },
  respond: ({ args, ok }) => {
    const request = args as { id: string }
    return ok({ deleted: true, id: request.id })
  },
})
