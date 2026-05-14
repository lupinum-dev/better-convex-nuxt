import { defineGuard } from '@lupinum/trellis/auth'

import type { Doc } from '../_generated/dataModel'
import type { AppIdentity } from './appIdentity'

export const hasWorkspace = defineGuard<AppIdentity>(
  'Workspace member',
  (appIdentity) => !!appIdentity?.workspaceId,
)
export const hasRole = (...roles: Doc<'users'>['role'][]) =>
  defineGuard<AppIdentity>(
    `role:${roles.join('|')}`,
    (appIdentity) => !!appIdentity && roles.includes(appIdentity.role),
  )
export const isOwnerOf = (resource: { ownerId: string }) =>
  defineGuard<AppIdentity>(
    `owner:${resource.ownerId}`,
    (appIdentity) => !!appIdentity && appIdentity.userId === resource.ownerId,
  )
