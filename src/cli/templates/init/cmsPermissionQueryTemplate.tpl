import { definePermissionContext } from '@lupinum/trellis/auth'

import { cmsPermissions } from '../auth/permissions'
import { getActor } from '../auth/actor'
import { query } from '../functions'

export const getPermissionContext = query(
  definePermissionContext({
    resolve: getActor,
    permissions: cmsPermissions,
  }),
)
