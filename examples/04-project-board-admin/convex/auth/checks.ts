import { and, or } from 'better-convex-nuxt/auth'

import type { Doc } from '../_generated/dataModel'
import type { Actor } from './actor'

export const isAuthenticated = (actor: Actor) => actor !== null
export const hasRole =
  (...roles: string[]) =>
  (actor: Actor) =>
    !!actor && roles.includes(actor.role)
export const isOwnerOf = (resource: { ownerId: string }) => (actor: Actor) =>
  !!actor && actor.userId === resource.ownerId

export const canCreateProject = hasRole('owner', 'admin')
export const canReadProject = hasRole('owner', 'admin', 'member', 'viewer')
export const canArchiveProject = hasRole('owner', 'admin')

export const canCreateTask = hasRole('owner', 'admin', 'member')
export const canReadTask = hasRole('owner', 'admin', 'member', 'viewer')
export const canAssignTask = hasRole('owner', 'admin')

export const canUpdateTask = (task: Doc<'tasks'>) =>
  or(hasRole('owner', 'admin'), and(hasRole('member'), isOwnerOf(task)))

export const canDeleteTask = (task: Doc<'tasks'>) =>
  or(hasRole('owner', 'admin'), and(hasRole('member'), isOwnerOf(task)))

export const canComment = hasRole('owner', 'admin', 'member', 'viewer')
export const canManageMembers = hasRole('owner', 'admin')
export const canViewAudit = hasRole('owner', 'admin')
