import { definePermissionContext } from '@lupinum/trellis/auth'

import { personalPermissions } from '../auth/permissions'
import { getActor } from '../auth/actor'
import { query } from '../functions'

export const getPermissionContext = query.protected(
  definePermissionContext({
    resolve: getActor,
    permissions: personalPermissions,
  }),
)
