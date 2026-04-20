import { defineGuard } from '@lupinum/trellis/auth'
import type { Infer } from 'convex/values'

import type { Id } from '../_generated/dataModel'
import type { roleValidator } from '../features/users'
import type { Actor } from './actor'

type UserRole = Infer<typeof roleValidator>

export function requireWorkspaceTenant(actor: { tenantId?: Id<'workspaces'> | null }) {
  if (!actor.tenantId) throw new Error('Current actor is not assigned to a workspace.')
  return actor.tenantId
}

export const hasWorkspace = defineGuard<Actor>('Workspace member', (actor) => !!actor?.tenantId)

export const hasRole = (...roles: UserRole[]) =>
  defineGuard<Actor>(`role:${roles.join('|')}`, (actor) => !!actor && roles.includes(actor.role))

export const isOwnerOf = (resource: { ownerId: string }) =>
  defineGuard<Actor>(
    `owner:${resource.ownerId}`,
    (actor) => !!actor && actor.userId === resource.ownerId,
  )
