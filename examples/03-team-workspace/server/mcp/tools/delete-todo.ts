import { api } from '#trellis/api'
/**
 * Why this file exists:
 * Destructive tools should preview the change first.
 * This example keeps that flow small enough to understand in one read.
 */
import { deleteTodo } from '~/shared/schemas/todo'
import { projectTool } from '../runtime'

export default projectTool({
  schema: deleteTodo,
  call: api.todos.remove,
  preview: api.todos.previewRemove,
  operation: 'mutation',
  previewOperation: 'query',
  capability: 'deleteTodo',
  meta: {
    name: 'delete-todo',
    destructive: true,
  },
})
