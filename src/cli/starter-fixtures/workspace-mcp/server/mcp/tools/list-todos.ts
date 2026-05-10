import { api } from '#trellis/api'
import { workspaceRead } from '~~/convex/features/todos'
import { listTodos } from '~~/shared/features/todos/contract'

import { tool } from '../runtime'

export default tool({
  schema: listTodos,
  call: api.features.todos.domain.list,
  operation: 'query',
  permission: workspaceRead,
  meta: {
    name: 'list-todos',
  },
})
