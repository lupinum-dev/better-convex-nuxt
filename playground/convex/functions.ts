import { createFunctions } from '../../src/runtime/convex'

import actorConfig from './actor.config'
import { permissionConfig } from './permissions.config'
import schema from './schema'

export const {
  publicQuery,
  publicMutation,
  openQuery,
  openMutation,
  authedQuery,
  authedMutation,
  scopedQuery,
  scopedMutation,
} = createFunctions({
  schema,
  permissions: permissionConfig,
  actor: actorConfig,
  tenant: {
    field: 'organizationId',
    index: 'by_organization',
  },
})
