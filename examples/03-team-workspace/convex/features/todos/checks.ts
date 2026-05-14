import { defineGuard } from '@lupinum/trellis/auth'

import type { AppIdentity } from '../../auth/appIdentity'
import { hasRole, hasWorkspace, isOwnerOf } from '../../auth/guards'

export const canUpdateTodo = (todo: { ownerId: string }) =>
  defineGuard<AppIdentity>(
    'Update todo',
    hasWorkspace.and(hasRole('owner', 'admin').or(hasRole('member').and(isOwnerOf(todo)))),
  )

export const canDeleteTodo = (todo: { ownerId: string }) =>
  defineGuard<AppIdentity>(
    'Delete todo',
    hasWorkspace.and(hasRole('owner', 'admin').or(hasRole('member').and(isOwnerOf(todo)))),
  )
