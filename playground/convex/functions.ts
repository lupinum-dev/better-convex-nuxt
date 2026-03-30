import { createFunctions } from '../../src/runtime/convex'

import actorConfig from './actor.config'
import { permissionConfig } from './permissions.config'
import { commentTable } from '../shared/schemas/comment'
import { postTable } from '../shared/schemas/post'

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
  schema: {
    posts: postTable,
    comments: commentTable,
    invites: { tenant: { scoped: true } },
    mcpKeys: { tenant: { scoped: true } },
  },
  permissions: permissionConfig,
  actor: actorConfig,
  tenant: {
    orgField: 'organizationId',
    orgIdFrom: 'actor',
  },
})
