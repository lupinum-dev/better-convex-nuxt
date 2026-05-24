import { useNuxtApp } from '#imports'

import { getBetterAuthClient } from '../internal/auth-runtime.js'

/**
 * Return the raw Better Auth client for provider-specific auth flows.
 *
 * Keep this separate from `useConvexAuth()` so app auth state does not expose
 * provider/client details by default.
 */
export function useBetterAuthClient(): ReturnType<typeof getBetterAuthClient> {
  return getBetterAuthClient(useNuxtApp())
}
