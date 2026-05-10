import { definePermissionContext } from '@lupinum/trellis/auth'

import { getPermissionActor } from '../auth/actor'
import { permissions } from '../features'
import { query } from '../functions'

export const getPermissionContext = query.protected(
  definePermissionContext({
    resolve: getPermissionActor,
    permissions,
  }),
)
