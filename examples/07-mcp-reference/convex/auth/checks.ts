/**
 * Check style:
 * Keep reusable primitives and record-bound factories here. Static named permissions live in
 * permissions.ts.
 */
import { defineGuard } from '@lupinum/trellis/auth'

import type { Doc } from '../_generated/dataModel'
import type { Actor, PermissionActor } from './actor'

export const hasRole = (...roles: Doc<'users'>['role'][]) =>
  defineGuard<PermissionActor>(
    `role:${roles.join('|')}`,
    (actor) => !!actor && roles.includes(actor.role),
  )
export const hasWorkspace = defineGuard<PermissionActor>(
  'Workspace member',
  (actor) => !!actor?.tenantId,
)
export const isOwnerOf = (resource: { ownerId: string }) =>
  defineGuard<PermissionActor>(
    `owner:${resource.ownerId}`,
    (actor) => !!actor && actor.userId === resource.ownerId,
  )
export const canUpdateRunbook = (runbook: { ownerId: string }) =>
  defineGuard<PermissionActor>(
    'Update runbook',
    hasRole('owner', 'admin').or(hasRole('member').and(isOwnerOf(runbook))),
  )
export const canDeleteRunbook = (runbook: { ownerId: string }) =>
  defineGuard<PermissionActor>(
    'Delete runbook',
    hasRole('owner', 'admin').or(hasRole('member').and(isOwnerOf(runbook))),
  )

export function canIssueKeyRole(actor: Actor, role: Doc<'users'>['role']): boolean {
  if (!actor) return false
  if (actor.role === 'owner') return ['owner', 'admin', 'member', 'viewer'].includes(role)
  if (actor.role === 'admin') return ['member', 'viewer'].includes(role)
  return false
}
