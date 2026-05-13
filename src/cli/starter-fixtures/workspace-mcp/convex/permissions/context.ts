import { defineAccessContext } from '@lupinum/trellis/auth'

import { getAccessIdentity } from '../auth/app-identity'
import { permissions } from '../features'
import { query } from '../functions'

export const getAccessContext = query.protected(
  defineAccessContext({
    resolve: getAccessIdentity,
    permissions,
  }),
)
