/**
 * Why this file exists:
 * This is the simplest MCP tool in the example: one schema, one permission, one scoped query.
 */
import { api } from '#trellis/api'
import { todoRead } from '~/convex/auth/permissions'
import { listTodos } from '~/shared/schemas/todo'

import { tool } from '../runtime'

export default tool({
  schema: listTodos,
  call: api.domain.todos.list,
  operation: 'query',
  permission: todoRead,
  meta: {
    name: 'list-todos',
  },
})
