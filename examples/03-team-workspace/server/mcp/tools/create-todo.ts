import { api } from '#trellis/api'
/**
 * Why this file exists:
 * This tool shows the "happy path" of MCP integration:
 * tool authors call `ctx.mutation(...)` and the trusted-caller plumbing stays hidden.
 */
import { createTodo } from '~/shared/schemas/todo'

import { tool } from '../runtime'

export default tool({
  schema: createTodo,
  call: api.todos.create,
  capability: 'createTodo',
  meta: {
    name: 'create-todo',
  },
})
