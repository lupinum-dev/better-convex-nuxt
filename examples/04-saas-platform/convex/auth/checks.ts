/**
 * Check style:
 * Keep reusable primitives and record-bound factories here. Static named permissions live in
 * permissions.ts so the full projected rule reads from one file.
 */
import { and, defineGuard, or } from '@lupinum/trellis/auth'

import type { Doc, Id } from '../_generated/dataModel'
import type { Actor } from './actor'

export function requireWorkspaceTenant(actor: { tenantId?: Id<'workspaces'> | null }) {
  if (!actor.tenantId) throw new Error('Current actor is not assigned to a workspace.')
  return actor.tenantId
}

export const hasWorkspace = defineGuard<Actor>('Workspace member', (actor) => !!actor?.tenantId)
export const hasRole = (...roles: Doc<'users'>['role'][]) =>
  defineGuard<Actor>(`role:${roles.join('|')}`, (actor) => roles.includes(actor.role))
export const isOwnerOf = (resource: { ownerId: string }) => (actor: Actor) =>
  actor.userId === resource.ownerId

export const canUpdateTask = (task: Doc<'tasks'>) =>
  hasWorkspace.and(or(hasRole('owner', 'admin'), and(hasRole('member'), isOwnerOf(task))))

export const canDeleteTask = (task: Doc<'tasks'>) =>
  hasWorkspace.and(or(hasRole('owner', 'admin'), and(hasRole('member'), isOwnerOf(task))))
