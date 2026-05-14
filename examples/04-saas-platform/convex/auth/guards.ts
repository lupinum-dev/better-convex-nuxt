/**
 * Check style:
 * Keep reusable shell-level primitives here. Feature-specific record checks live inside the
 * relevant feature folder so the business rule stays next to the handlers that use it.
 */
import { defineGuard } from '@lupinum/trellis/auth'

import type { Doc, Id } from '../_generated/dataModel'
import type { AppIdentity } from './appIdentity'

export function requireWorkspaceTenant(appIdentity: { workspaceId?: Id<'workspaces'> | null }) {
  if (!appIdentity.workspaceId)
    throw new Error('Current appIdentity is not assigned to a workspace.')
  return appIdentity.workspaceId
}

export const hasWorkspace = defineGuard<AppIdentity>(
  'Workspace member',
  (appIdentity) => !!appIdentity?.workspaceId,
)
export const hasRole = (...roles: Doc<'users'>['role'][]) =>
  defineGuard<AppIdentity>(`role:${roles.join('|')}`, (appIdentity) =>
    roles.includes(appIdentity.role),
  )
export const isOwnerOf = (resource: { ownerId: string }) => (appIdentity: AppIdentity) =>
  appIdentity.userId === resource.ownerId
