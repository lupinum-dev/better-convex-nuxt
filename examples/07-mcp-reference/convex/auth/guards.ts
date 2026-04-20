import { defineGuard } from '@lupinum/trellis/auth'

import type { PermissionActor } from './actor'
import type { Role } from './principal'

export const hasRole = (...roles: Role[]) =>
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
