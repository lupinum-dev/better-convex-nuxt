import { inferAdditionalFields } from 'better-auth/client/plugins'

import { createBetterConvexAuthClient } from '#imports'

import type { AppAuth } from '../convex/auth'

function createExtendedAuthClient() {
  return createBetterConvexAuthClient({
    plugins: [inferAdditionalFields<AppAuth>()],
  })
}

type ExtendedAuthClient = ReturnType<typeof createExtendedAuthClient>

let extendedAuthClient: ExtendedAuthClient | null = null

/**
 * Playground helper that demonstrates how to add Better Auth client plugins
 * while keeping Convex token synchronization through createBetterConvexAuthClient().
 *
 * Returns null on SSR, matching `useAuthClient()` behavior.
 */
export function useExtendedAuthClient(): ExtendedAuthClient | null {
  if (import.meta.server) {
    return null
  }

  if (!extendedAuthClient) {
    extendedAuthClient = createExtendedAuthClient()
  }

  return extendedAuthClient
}
