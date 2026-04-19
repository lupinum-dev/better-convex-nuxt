import { api } from '#trellis/api'
import { todoRead } from '~/convex/auth/permissions'
/**
 * Why this file exists:
 * This tool reuses the same schema as the UI and shows permission-aware updates.
 */
import { setTodoCompleted } from '~/shared/schemas/todo'

import { tool } from '../runtime'

export default tool({
  schema: setTodoCompleted,
  call: api.domain.todos.setCompleted,
  permission: todoRead,
  meta: {
    name: 'complete-todo',
  },
})
