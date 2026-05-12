import { stampMcpToolSafety } from '@lupinum/trellis/mcp'
import { todoCreate } from '~~/convex/features/todos'
import { createTodo } from '~~/shared/features/todos/contract'

import { api } from '#trellis/api'

import { tool } from '../runtime'

const createTodoSafety = {
  kind: 'bounded-write',
  reason: 'Creates one todo in the delegated workspace.',
} as const

export default tool.mutation({
  schema: createTodo,
  call: stampMcpToolSafety(api.features.todos.domain.create, createTodoSafety),
  permission: todoCreate,
  safety: createTodoSafety,
  meta: {
    name: 'create-todo',
  },
})
