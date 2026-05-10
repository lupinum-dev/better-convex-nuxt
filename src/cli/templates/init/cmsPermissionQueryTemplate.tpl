import { definePermissionContext } from '@lupinum/trellis/auth'

import { getActor } from '../auth/actor'
import { permissions } from '../features'
import { query } from '../functions'

export const getPermissionContext = query.protected(
  definePermissionContext({
    resolve: getActor,
    permissions,
  }),
)
