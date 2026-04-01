import { loadTenantResource, requireRecord } from 'better-convex-nuxt/auth'

export { requireRecord }

// Re-export as loadResource for backwards compat within this example
export const loadResource = loadTenantResource
