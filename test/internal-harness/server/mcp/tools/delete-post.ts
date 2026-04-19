import {
  previewRemove,
  removePostOp,
  removeWithConfirmation,
} from '../../../convex/posts'
import type { FunctionReference } from 'convex/server'
import { tool } from '../runtime'

export default tool.fromOperation(removePostOp, {
  execute: removeWithConfirmation as unknown as FunctionReference<'mutation', 'public'>,
  preview: previewRemove as unknown as FunctionReference<'query', 'public'>,
  permission: 'deletePost',
  meta: {
    name: 'delete-post',
  },
  respond: ({ args, ok }) => {
    const request = args as { id: string }
    return ok({ deleted: true, id: request.id })
  },
})
