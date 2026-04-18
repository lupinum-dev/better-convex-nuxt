/**
 * Why this file exists:
 * Destructive tools should preview the change first.
 * This example keeps that flow small enough to understand in one read.
 */
import { remove } from '~/convex/domain/todos'
import { previewRemove, removeTodoOp } from '~/convex/operations/todos'

import { tool } from '../runtime'

export default tool.fromOperation(removeTodoOp, {
  execute: remove,
  preview: previewRemove,
  capability: 'deleteTodo',
  meta: {
    name: 'delete-todo',
  },
})
