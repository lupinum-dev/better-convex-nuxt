import { defineGuard } from '@lupinum/trellis/auth'

import type { AccessIdentity } from './appIdentity'
import type { Role } from './caller'

export const isAuthenticated = defineGuard<AccessIdentity>(
  'authenticated',
  (appIdentity) => appIdentity !== null,
)

export const hasWorkspace = defineGuard<AccessIdentity>(
  'workspace-member',
  (appIdentity) => !!appIdentity?.workspaceId,
)

export const hasMinimumRole = (minimum: Role) =>
  defineGuard<AccessIdentity>(`role>=${minimum}`, (appIdentity) => {
    if (!appIdentity?.workspaceId) return false

    const ranks: Record<Role, number> = {
      owner: 4,
      admin: 3,
      member: 2,
      viewer: 1,
    }

    return ranks[appIdentity.role] >= ranks[minimum]
  })

export const isWorkspaceMember = (workspaceId: string) =>
  defineGuard<AccessIdentity>(
    `workspace:${workspaceId}`,
    (appIdentity) => !!appIdentity?.workspaceId && appIdentity.workspaceId === workspaceId,
  )

export const canManageWorkspace = defineGuard<AccessIdentity>(
  'manage-workspace',
  hasWorkspace.and(hasMinimumRole('admin')),
)
