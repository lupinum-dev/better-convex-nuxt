import { defineGuard } from '@lupinum/trellis/auth'

import type { Actor } from '../../auth/actor'
import { hasRole, hasWorkspace, isOwnerOf } from '../../auth/guards'

export const canUpdateTodo = (todo: { ownerId: string }) =>
  defineGuard<Actor>(
    'Update todo',
    hasWorkspace.and(hasRole('owner', 'admin').or(hasRole('member').and(isOwnerOf(todo)))),
  )

export const canDeleteTodo = (todo: { ownerId: string }) =>
  defineGuard<Actor>(
    'Delete todo',
    hasWorkspace.and(hasRole('owner', 'admin').or(hasRole('member').and(isOwnerOf(todo)))),
  )
