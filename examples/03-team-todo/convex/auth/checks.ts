import { and, or } from 'better-convex-nuxt/auth'

import type { Actor } from './actor'

export const hasRole = (...roles: string[]) => (actor: Actor) => !!actor && roles.includes(actor.role)
export const isOwnerOf = (resource: { ownerId: string }) =>
  (actor: Actor) => !!actor && actor.kind === 'user' && resource.ownerId === actor.userId

export const canCreateTodo = hasRole('owner', 'admin', 'member')
export const canReadTodo = hasRole('owner', 'admin', 'member', 'viewer')
export const canUpdateTodo = (todo: { ownerId: string }) =>
  or(hasRole('owner', 'admin'), and(hasRole('member'), isOwnerOf(todo)))
export const canDeleteTodo = (todo: { ownerId: string }) =>
  or(hasRole('owner', 'admin'), and(hasRole('member'), isOwnerOf(todo)))
