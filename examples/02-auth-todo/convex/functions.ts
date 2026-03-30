/**
 * Why this file exists:
 * All Convex function files import their builders from here.
 * This example only needs the auth-required builders because todos belong to individual users.
 */
import { createFunctions } from 'better-convex-nuxt/convex'

import actorConfig from './actor.config'

export const {
  authedQuery,
  authedMutation,
} = createFunctions({
  actor: actorConfig,
})
