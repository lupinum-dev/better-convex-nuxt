import { defineGuard } from '@lupinum/trellis/auth'

import type { AccessIdentity } from './appIdentity'
import type { Role } from './caller'

export const hasRole = (...roles: Role[]) =>
  defineGuard<AccessIdentity>(
    `role:${roles.join('|')}`,
    (appIdentity) => !!appIdentity && roles.includes(appIdentity.role),
  )

export const hasWorkspace = defineGuard<AccessIdentity>(
  'Workspace member',
  (appIdentity) => !!appIdentity?.workspaceId,
)

export const isOwnerOf = (resource: { ownerId: string }) =>
  defineGuard<AccessIdentity>(
    `owner:${resource.ownerId}`,
    (appIdentity) => !!appIdentity && appIdentity.userId === resource.ownerId,
  )
