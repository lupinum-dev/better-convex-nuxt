import { defineGuard } from '@lupinum/trellis/auth'
import type { Infer } from 'convex/values'

import type { Id } from '../_generated/dataModel'
import type { roleValidator } from '../features/users'
import type { AppIdentity } from './appIdentity'

type UserRole = Infer<typeof roleValidator>

export function requireWorkspaceTenant(appIdentity: { workspaceId?: Id<'workspaces'> | null }) {
  if (!appIdentity.workspaceId)
    throw new Error('Current appIdentity is not assigned to a workspace.')
  return appIdentity.workspaceId
}

export const hasWorkspace = defineGuard<AppIdentity>(
  'Workspace member',
  (appIdentity) => !!appIdentity?.workspaceId,
)

export const hasRole = (...roles: UserRole[]) =>
  defineGuard<AppIdentity>(
    `role:${roles.join('|')}`,
    (appIdentity) => !!appIdentity && roles.includes(appIdentity.role),
  )

export const isOwnerOf = (resource: { ownerId: string }) =>
  defineGuard<AppIdentity>(
    `owner:${resource.ownerId}`,
    (appIdentity) => !!appIdentity && appIdentity.userId === resource.ownerId,
  )
