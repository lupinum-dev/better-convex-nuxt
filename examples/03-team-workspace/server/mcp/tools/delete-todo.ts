/**
 * Why this file exists:
 * Destructive tools should preview the change first.
 * This example keeps that flow small enough to understand in one read.
 */
import { remove } from '~/convex/domain/todos'
import { previewRemove, removeTodoOp } from '~/convex/operations/todos'
import { todoRead } from '~/convex/auth/permissions'

import { tool } from '../runtime'

export default tool.fromOperation(removeTodoOp, {
  execute: remove,
  preview: previewRemove,
  permission: todoRead,
  meta: {
    name: 'delete-todo',
  },
})
