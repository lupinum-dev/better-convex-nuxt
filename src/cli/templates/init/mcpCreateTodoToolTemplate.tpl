import { api } from '#trellis/api'
import { todoCreate } from '~/convex/auth/permissions'
import { createTodo } from '~/shared/schemas/todo'

import { tool } from '../runtime'

export default tool({
  schema: createTodo,
  call: api.domain.todos.create,
  operation: 'mutation',
  permission: todoCreate,
  meta: {
    name: 'create-todo',
  },
})
