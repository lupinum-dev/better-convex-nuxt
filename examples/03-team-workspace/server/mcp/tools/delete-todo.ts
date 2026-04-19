import { api } from '~/convex/_generated/api'
import { todoRead } from '~/convex/auth/permissions'
/**
 * Why this file exists:
 * Destructive tools should preview the change first.
 * This example keeps that flow small enough to understand in one read.
 */
import { removeTodoOp } from '~/convex/operations/todos'

import { tool } from '../runtime'

export default tool.fromOperation(removeTodoOp, {
  execute: api.domain.todos.remove,
  preview: api.operations.todos.previewRemove,
  permission: todoRead,
  meta: {
    name: 'delete-todo',
  },
})
