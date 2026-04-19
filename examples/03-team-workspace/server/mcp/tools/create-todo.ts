import { api } from '#trellis/api'
import { todoCreate } from '~/convex/auth/permissions'
/**
 * Why this file exists:
 * This tool shows the "happy path" of MCP integration:
 * tool authors call `ctx.mutation(...)` and the trusted-caller plumbing stays hidden.
 */
import { createTodo } from '~/shared/schemas/todo'

import { tool } from '../runtime'

export default tool({
  schema: createTodo,
  call: api.domain.todos.create,
  permission: todoCreate,
  meta: {
    name: 'create-todo',
  },
})
