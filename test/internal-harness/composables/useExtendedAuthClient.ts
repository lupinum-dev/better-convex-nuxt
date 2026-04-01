import { convexClient } from '@convex-dev/better-auth/client/plugins'
import { inferAdditionalFields } from 'better-auth/client/plugins'
import { createAuthClient as createClient } from 'better-auth/vue'

import { useRuntimeConfig } from '#imports'

import type { AppAuth } from '../convex/auth'

function resolveAuthBaseURL() {
  const config = useRuntimeConfig()
  const rawAuthRoute =
    (config.public?.convex as { authRoute?: string } | undefined)?.authRoute || '/api/auth'
  const authRoute = (rawAuthRoute.startsWith('/') ? rawAuthRoute : `/${rawAuthRoute}`).replace(
    /\/+$/,
    '',
  )

  // Better Auth client expects an absolute URL (relative '/api/auth' fails validation).
  return `${window.location.origin}${authRoute}`
}

function createExtendedAuthClient(baseURL: string) {
  return createClient({
    baseURL,
    plugins: [convexClient(), inferAdditionalFields<AppAuth>()],
    fetchOptions: { credentials: 'include' },
  })
}

type ExtendedAuthClient = ReturnType<typeof createExtendedAuthClient>

let extendedAuthClient: ExtendedAuthClient | null = null
let extendedAuthClientBaseURL: string | null = null

/**
 * Playground helper that demonstrates how to add Better Auth client plugins
 * while keeping Convex token synchronization (`convexClient()`).
 *
 * Returns null on SSR, matching `useAuthClient()` behavior.
 */
export function useExtendedAuthClient(): ExtendedAuthClient | null {
  if (import.meta.server) {
    return null
  }

  if (!extendedAuthClient) {
    const baseURL = resolveAuthBaseURL()
    extendedAuthClient = createExtendedAuthClient(baseURL)
    extendedAuthClientBaseURL = baseURL
  }

  // Recreate if authRoute/origin changed during dev/HMR.
  const nextBaseURL = resolveAuthBaseURL()
  if (extendedAuthClientBaseURL !== nextBaseURL) {
    extendedAuthClient = createExtendedAuthClient(nextBaseURL)
    extendedAuthClientBaseURL = nextBaseURL
  }

  return extendedAuthClient
}
