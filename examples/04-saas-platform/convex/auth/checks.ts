/**
 * Check style:
 * Direct exports are static actor predicates. Resource-bound checks are factories that return
 * actor predicates after you bind the relevant document.
 */
import { and, or } from 'better-convex-nuxt/auth'

import type { Doc } from '../_generated/dataModel'
import type { Actor } from './actor'

const planFeatures: Record<Doc<'workspaces'>['plan'], string[]> = {
  free: ['projects'],
  pro: ['projects', 'exports'],
  enterprise: ['*'],
}

export const isAuthenticated = (actor: Actor) => actor !== null
export const hasRole =
  (...roles: Doc<'users'>['role'][]) =>
  (actor: Actor) =>
    !!actor && roles.includes(actor.role)
export const isOwnerOf = (resource: { ownerId: string }) => (actor: Actor) =>
  !!actor && actor.userId === resource.ownerId

export const hasFeature = (feature: string) => (actor: Actor) => {
  if (!actor) return false
  const features = planFeatures[actor.plan ?? 'free'] ?? []
  return features.includes(feature) || features.includes('*')
}

export const canCreateProject = hasRole('owner', 'admin')
export const canReadProject = hasRole('owner', 'admin', 'member', 'viewer')
export const canArchiveProject = hasRole('owner', 'admin')
export const canExportProjects = and(hasRole('owner', 'admin'), hasFeature('exports'))

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
