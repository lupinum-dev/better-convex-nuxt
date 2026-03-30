/**
 * Why this file exists:
 * Convex files run on Convex's infrastructure, not in Nuxt's module runtime.
 * This file creates the builder family once for that runtime boundary, then the rest of the
 * Convex handlers import only the builders they need.
 */
import { createFunctions } from 'better-convex-nuxt/convex'

import actorConfig from './actor.config'
import { permissionConfig } from './permissions.config'
import schema from './schema'

// Destructure only the builders this example uses. `createFunctions()` also provides
// publicMutation, openMutation, and authedQuery for other app shapes.
export const {
  publicQuery,
  openQuery,
  authedMutation,
  scopedQuery,
  scopedMutation,
} = createFunctions({
  schema,
  actor: actorConfig,
  permissions: permissionConfig,
  tenant: {
    field: 'workspaceId',
    index: 'by_workspace',
  },
})
