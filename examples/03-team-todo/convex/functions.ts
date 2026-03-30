/**
 * Why this file exists:
 * Convex functions run on Convex's infrastructure, not inside Nuxt's module runtime.
 * That means Nuxt can't auto-generate builders for files in `convex/`, so this file is the app-local bridge:
 * create the builder family once here, then import the specific builders from every Convex handler.
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
