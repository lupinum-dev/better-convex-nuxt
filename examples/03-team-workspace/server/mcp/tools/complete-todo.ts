import { api } from '#trellis/api'
/**
 * Why this file exists:
 * This tool reuses the same schema as the UI and shows permission-aware updates.
 */
import { setTodoCompleted } from '~/shared/schemas/todo'

import { projectTool } from '../runtime'

export default projectTool({
  schema: setTodoCompleted,
  call: api.todos.setCompleted,
  capability: 'completeTodo',
  meta: {
    name: 'complete-todo',
  },
})
