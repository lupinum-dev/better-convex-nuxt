import { todoCreate } from '~~/convex/features/todos'
import { createTodo } from '~~/shared/features/todos/contract'

import { api } from '#trellis/api'

import { tool } from '../runtime'

export default tool({
  schema: createTodo,
  call: api.features.todos.domain.create,
  operation: 'mutation',
  permission: todoCreate,
  meta: {
    name: 'create-todo',
  },
})
