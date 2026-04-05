/**
 * Check style:
 * Direct exports are static actor predicates. Resource-bound checks are factories that return
 * actor predicates after you bind the relevant document.
 */
import { and, defineGuard, or } from '@lupinum/trellis/auth'

import type { Doc, Id } from '../_generated/dataModel'
import type { Actor } from './actor'

export function requireWorkspaceTenant(actor: { tenantId?: Id<'workspaces'> | null }) {
  if (!actor.tenantId) throw new Error('Current actor is not assigned to a workspace.')
  return actor.tenantId
}

const planFeatures: Record<Doc<'workspaces'>['plan'], string[]> = {
  free: ['projects'],
  pro: ['projects', 'exports'],
  enterprise: ['*'],
}

export const hasWorkspace = defineGuard<Actor>('Workspace member', (actor) => !!actor?.tenantId)
export const hasRole =
  (...roles: Doc<'users'>['role'][]) =>
  defineGuard<Actor>(`role:${roles.join('|')}`, (actor) => roles.includes(actor.role))
export const isOwnerOf = (resource: { ownerId: string }) => (actor: Actor) =>
  actor.userId === resource.ownerId

export const hasFeature = (feature: string) => (actor: Actor) => {
  const features = planFeatures[actor.plan ?? 'free'] ?? []
  return features.includes(feature) || features.includes('*')
}

export const canCreateProject = defineGuard(
  'Create project',
  hasWorkspace.and(hasRole('owner', 'admin')),
)
export const canReadProject = defineGuard(
  'Read project',
  hasWorkspace.and(hasRole('owner', 'admin', 'member', 'viewer')),
)
export const canArchiveProject = defineGuard(
  'Archive project',
  hasWorkspace.and(hasRole('owner', 'admin')),
)
export const canExportProjects = defineGuard(
  'Export projects',
  hasWorkspace.and(and(hasRole('owner', 'admin'), hasFeature('exports'))),
)

export const canCreateTask = defineGuard(
  'Create task',
  hasWorkspace.and(hasRole('owner', 'admin', 'member')),
)
export const canReadTask = defineGuard(
  'Read task',
  hasWorkspace.and(hasRole('owner', 'admin', 'member', 'viewer')),
)
export const canAssignTask = defineGuard(
  'Assign task',
  hasWorkspace.and(hasRole('owner', 'admin')),
)

export const canUpdateTask = (task: Doc<'tasks'>) =>
  hasWorkspace.and(or(hasRole('owner', 'admin'), and(hasRole('member'), isOwnerOf(task))))

export const canDeleteTask = (task: Doc<'tasks'>) =>
  hasWorkspace.and(or(hasRole('owner', 'admin'), and(hasRole('member'), isOwnerOf(task))))

export const canComment = defineGuard(
  'Create comment',
  hasWorkspace.and(hasRole('owner', 'admin', 'member', 'viewer')),
)
export const canManageMembers = defineGuard(
  'Manage members',
  hasWorkspace.and(hasRole('owner', 'admin')),
)
export const canViewAudit = defineGuard(
  'View audit log',
  hasWorkspace.and(hasRole('owner', 'admin')),
)
