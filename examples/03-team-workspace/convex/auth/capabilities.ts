import { can } from 'better-convex-nuxt/auth'
import { defineCapabilities } from 'better-convex-nuxt/visibility'

import type { Doc } from '../_generated/dataModel'
import type { Actor } from './actor'
import { canDeleteTodo, canUpdateTodo } from './checks'

export const todoCapabilities = defineCapabilities<Doc<'todos'>>()<
  NonNullable<Actor>,
  {
    update: (actor: NonNullable<Actor>, todo: Doc<'todos'>) => boolean
    delete: (actor: NonNullable<Actor>, todo: Doc<'todos'>) => boolean
  }
>({
  update: (actor, todo) => can(actor, canUpdateTodo(todo)),
  delete: (actor, todo) => can(actor, canDeleteTodo(todo)),
})
