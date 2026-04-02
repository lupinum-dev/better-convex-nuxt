/**
 * Check style:
 * Direct exports are static actor predicates. Resource-bound checks are factories that return
 * actor predicates after you bind the relevant document.
 */
import { defineGuard } from '@lupinum/trellis/auth'

import type { Doc } from '../_generated/dataModel'
import type { Actor } from './actor'

export const hasRole = (...roles: Doc<'users'>['role'][]) =>
  defineGuard<Actor>(`role:${roles.join('|')}`, (actor) => !!actor && roles.includes(actor.role))
export const isOwnerOf = (resource: { ownerId: string }) =>
  defineGuard<Actor>(
    `owner:${resource.ownerId}`,
    (actor) => !!actor && actor.userId === resource.ownerId,
  )

export const canCreateTodo = defineGuard<Actor>('Create todo', hasRole('owner', 'admin', 'member'))
export const canReadTodo = defineGuard<Actor>(
  'Read todos',
  hasRole('owner', 'admin', 'member', 'viewer'),
)
export const canUpdateTodo = (todo: { ownerId: string }) =>
  defineGuard<Actor>(
    'Update todo',
    hasRole('owner', 'admin').or(hasRole('member').and(isOwnerOf(todo))),
  )
export const canDeleteTodo = (todo: { ownerId: string }) =>
  defineGuard<Actor>(
    'Delete todo',
    hasRole('owner', 'admin').or(hasRole('member').and(isOwnerOf(todo))),
  )
