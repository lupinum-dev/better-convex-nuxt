import { defineGuard } from '@lupinum/trellis/auth'

import type { PermissionActor } from './actor'
import type { Role } from './principal'

export const isAuthenticated = defineGuard<PermissionActor>(
  'authenticated',
  (actor) => actor !== null,
)

export const hasWorkspace = defineGuard<PermissionActor>(
  'workspace-member',
  (actor) => !!actor?.tenantId,
)

export const hasMinimumRole = (minimum: Role) =>
  defineGuard<PermissionActor>(`role>=${minimum}`, (actor) => {
    if (!actor?.tenantId) return false

    const ranks: Record<Role, number> = {
      owner: 4,
      admin: 3,
      member: 2,
      viewer: 1,
    }

    return ranks[actor.role] >= ranks[minimum]
  })

export const isWorkspaceMember = (tenantId: string) =>
  defineGuard<PermissionActor>(
    `workspace:${tenantId}`,
    (actor) => !!actor?.tenantId && actor.tenantId === tenantId,
  )

export const canManageWorkspace = defineGuard<PermissionActor>(
  'manage-workspace',
  hasWorkspace.and(hasMinimumRole('admin')),
)
