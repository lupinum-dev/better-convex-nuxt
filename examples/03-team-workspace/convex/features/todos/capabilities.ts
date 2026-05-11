import { can } from '@lupinum/trellis/auth'
import { defineCapabilities } from '@lupinum/trellis/workspace'

import type { Doc } from '../../_generated/dataModel'
import type { Actor } from '../../auth/actor'
import { canDeleteTodo, canUpdateTodo } from './checks'

export const todoCapabilities = defineCapabilities<Doc<'todos'>>()({
  update: (actor: Actor, todo) => can(actor, canUpdateTodo(todo)),
  delete: (actor: Actor, todo) => can(actor, canDeleteTodo(todo)),
})
