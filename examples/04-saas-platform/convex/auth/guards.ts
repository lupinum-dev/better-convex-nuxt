/**
 * Check style:
 * Keep reusable shell-level primitives here. Feature-specific record checks live inside the
 * relevant feature folder so the business rule stays next to the handlers that use it.
 */
import { defineGuard } from '@lupinum/trellis/auth'

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
