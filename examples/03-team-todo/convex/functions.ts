/**
 * Why this file exists:
 * This file defines the project's builder family once.
 * The rest of the backend only imports the specific builders it needs, and the safe defaults stay centralized.
 */
import { createFunctions } from 'better-convex-nuxt/convex'

import actorConfig from './actor.config'
import { permissionConfig } from './permissions.config'
import schema from './schema'

// Destructure only the builders this app uses.
// createFunctions() also provides publicMutation, openMutation, and authedQuery.
export const {
  publicQuery,
  authedMutation,
  openQuery,
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
