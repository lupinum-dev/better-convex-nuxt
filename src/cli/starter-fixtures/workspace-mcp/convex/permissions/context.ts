import { defineAccessContext } from '@lupinum/trellis/auth'

import { getAccessIdentity } from '../auth/appIdentity'
import { permissions } from '../features'
import { query } from '../functions'

export const getAccessContext = query.protected(
  defineAccessContext({
    resolve: getAccessIdentity,
    permissions,
  }),
)
