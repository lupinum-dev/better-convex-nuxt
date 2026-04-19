import { api } from '#trellis/api'
/**
 * Why this file exists:
 * This tool reuses the same schema as the UI and shows permission-aware updates.
 */
import { setTodoCompleted } from '~/shared/schemas/todo'
import { todoRead } from '~/convex/auth/permissions'

import { tool } from '../runtime'

export default tool({
  schema: setTodoCompleted,
  call: api.domain.todos.setCompleted,
  permission: todoRead,
  meta: {
    name: 'complete-todo',
  },
})
