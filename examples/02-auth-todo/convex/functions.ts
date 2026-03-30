/**
 * Why this file exists:
 * Convex functions do not run inside Nuxt's auto-import scope.
 * This file creates the builders once for the Convex runtime, then every handler imports from here.
 */
import { createFunctions } from 'better-convex-nuxt/convex'

import actorConfig from './actor.config'

export const {
  authedQuery,
  authedMutation,
} = createFunctions({
  actor: actorConfig,
})
