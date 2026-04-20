import { definePermissionContext } from '@lupinum/trellis/auth'

import { workspacePermissions } from '../auth/permissions'
import { getPermissionActor } from '../auth/actor'
import { query } from '../functions'

export const getPermissionContext = query(
  definePermissionContext({
    resolve: getPermissionActor,
    permissions: workspacePermissions,
  }),
)
