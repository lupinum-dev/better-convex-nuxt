import { can } from 'better-convex-nuxt/auth'
import { defineCapabilities } from 'better-convex-nuxt/visibility'

import type { Doc } from '../_generated/dataModel'
import type { Actor } from './actor'
import { canDeleteTodo, canUpdateTodo } from './checks'

export const todoCapabilities = defineCapabilities<Doc<'todos'>>()({
  update: (actor, todo) => can(actor, canUpdateTodo(todo)),
  delete: (actor, todo) => can(actor, canDeleteTodo(todo)),
})
