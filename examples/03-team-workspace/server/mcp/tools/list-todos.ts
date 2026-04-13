/**
 * Why this file exists:
 * This is the simplest MCP tool in the example: one schema, one permission, one scoped query.
 */
import { api } from '#trellis/api'
import { listTodos } from '~/shared/schemas/todo'

import { projectTool } from '../runtime'

export default projectTool({
  schema: listTodos,
  call: api.todos.list,
  operation: 'query',
  capability: 'listTodos',
  meta: {
    name: 'list-todos',
  },
})
