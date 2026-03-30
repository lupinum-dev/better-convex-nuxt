/**
 * Why this file exists:
 * The app creates its Convex builders once, then every function file imports from here.
 * In this example we only need the public builders because the app has no auth at all.
 */
import { createFunctions } from 'better-convex-nuxt/convex'

import actorConfig from './actor.config'

export const {
  publicQuery,
  publicMutation,
} = createFunctions({
  actor: actorConfig,
})
