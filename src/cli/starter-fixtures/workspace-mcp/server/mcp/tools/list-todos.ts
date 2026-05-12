import { workspaceRead } from '~~/convex/features/todos'
import { listTodos } from '~~/shared/features/todos/contract'

import { api } from '#trellis/api'

import { tool } from '../runtime'

export default tool.query({
  schema: listTodos,
  call: api.features.todos.domain.list,
  permission: workspaceRead,
  meta: {
    name: 'list-todos',
  },
})
