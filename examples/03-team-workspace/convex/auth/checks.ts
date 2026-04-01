/**
 * Check style:
 * Direct exports are static actor predicates. Resource-bound checks are factories that return
 * actor predicates after you bind the relevant document.
 */
import { and, or } from 'better-convex-nuxt/auth'

import type { Doc } from '../_generated/dataModel'
import type { Actor } from './actor'

export const hasRole =
  (...roles: Doc<'users'>['role'][]) =>
  (actor: Actor) =>
    !!actor && roles.includes(actor.role)
export const isOwnerOf = (resource: { ownerId: string }) => (actor: Actor) =>
  !!actor && actor.userId === resource.ownerId

export const canCreateTodo = hasRole('owner', 'admin', 'member')
export const canReadTodo = hasRole('owner', 'admin', 'member', 'viewer')
export const canUpdateTodo = (todo: { ownerId: string }) =>
  or(hasRole('owner', 'admin'), and(hasRole('member'), isOwnerOf(todo)))
export const canDeleteTodo = (todo: { ownerId: string }) =>
  or(hasRole('owner', 'admin'), and(hasRole('member'), isOwnerOf(todo)))
