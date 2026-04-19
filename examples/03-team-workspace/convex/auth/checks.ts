/**
 * Check style:
 * Direct exports are static actor predicates. Resource-bound checks are factories that return
 * actor predicates after you bind the relevant document.
 */
import { defineGuard } from '@lupinum/trellis/auth'

import type { Doc } from '../_generated/dataModel'
import type { Actor } from './actor'

export const hasWorkspace = defineGuard<Actor>('Workspace member', (actor) => !!actor?.tenantId)
export const hasRole = (...roles: Doc<'users'>['role'][]) =>
  defineGuard<Actor>(`role:${roles.join('|')}`, (actor) => !!actor && roles.includes(actor.role))
export const isOwnerOf = (resource: { ownerId: string }) =>
  defineGuard<Actor>(
    `owner:${resource.ownerId}`,
    (actor) => !!actor && actor.userId === resource.ownerId,
  )
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
