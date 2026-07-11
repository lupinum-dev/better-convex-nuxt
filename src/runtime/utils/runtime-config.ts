import { useRuntimeConfig } from '#imports'

import {
  normalizeConvexRuntimeConfig,
  type NormalizedConvexRuntimeConfig,
} from './runtime-config-normalize'

export * from './runtime-config-normalize'

/** Read and normalize the current Nuxt application's public Convex config. */
export function getConvexRuntimeConfig(): NormalizedConvexRuntimeConfig {
  return normalizeConvexRuntimeConfig(useRuntimeConfig().public.convex)
}
