/**
 * Why this file exists:
 * `createFunctions()` always takes one actor config for the whole app.
 * This public-only example never resolves an actor, so the config is intentionally empty.
 */
import { defineActorConfig } from 'better-convex-nuxt/convex'

export default defineActorConfig({
  resolveFromAuth: async () => null,
})
