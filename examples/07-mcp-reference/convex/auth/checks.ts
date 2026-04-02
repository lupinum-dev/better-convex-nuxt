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

export const canCreateRunbook = defineGuard<Actor>(
  'Create runbook',
  hasRole('owner', 'admin', 'member'),
)
export const canReadWorkspaceRunbook = defineGuard<Actor>(
  'Read runbooks',
  hasRole('owner', 'admin', 'member', 'viewer'),
)
export const canUpdateRunbook = (runbook: { ownerId: string }) =>
  defineGuard<Actor>(
    'Update runbook',
    hasRole('owner', 'admin').or(hasRole('member').and(isOwnerOf(runbook))),
  )
export const canDeleteRunbook = (runbook: { ownerId: string }) =>
  defineGuard<Actor>(
    'Delete runbook',
    hasRole('owner', 'admin').or(hasRole('member').and(isOwnerOf(runbook))),
  )
export const canPublishRunbook = defineGuard<Actor>('Publish runbook', hasRole('owner', 'admin'))
export const canManageMcpKeys = defineGuard<Actor>('Manage MCP keys', hasRole('owner', 'admin'))

export function canIssueKeyRole(actor: Actor, role: Doc<'users'>['role']): boolean {
  if (!actor) return false
  if (actor.role === 'owner') return ['owner', 'admin', 'member', 'viewer'].includes(role)
  if (actor.role === 'admin') return ['member', 'viewer'].includes(role)
  return false
}
