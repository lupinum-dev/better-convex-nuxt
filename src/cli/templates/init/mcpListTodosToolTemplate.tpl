import { api } from '#trellis/api'
import { workspaceRead } from '~/convex/auth/permissions'
import { listTodos } from '~/convex/domain/todo.contract'

import { tool } from '../runtime'

export default tool({
  schema: listTodos,
  call: api.domain.todos.list,
  operation: 'query',
  permission: workspaceRead,
  meta: {
    name: 'list-todos',
  },
})
