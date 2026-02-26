import { navigateTo, useRoute, useRuntimeConfig } from '#imports'

import { useAuth } from '../composables/useAuth'
import { normalizeConvexAuthConfig } from './auth-config'
import { isConvexUnauthorizedError } from './auth-unauthorized-core'

export type UnauthorizedErrorSource = 'mutation' | 'action' | 'query'

let activeUnauthorizedRecovery: Promise<void> | null = null
let lastUnauthorizedRedirectKey: string | null = null
let lastUnauthorizedRedirectAt = 0

export async function handleUnauthorizedAuthFailure(options: {
  error: unknown
  source: UnauthorizedErrorSource
  functionName?: string
}): Promise<boolean> {
  if (import.meta.server) return false
  if (!isConvexUnauthorizedError(options.error)) return false

  const runtimeConfig = useRuntimeConfig()
  const authConfig = normalizeConvexAuthConfig(runtimeConfig.public.convex?.auth)
  const unauthorized = authConfig.unauthorized

  if (!authConfig.enabled || !unauthorized.enabled) return false
  if (options.source === 'query' && !unauthorized.includeQueries) return false

  const route = useRoute()
  const redirectTo = unauthorized.redirectTo
  if (route.path === redirectTo) return false

  const dedupeKey = `${options.source}:${redirectTo}:${route.fullPath}`
  const now = Date.now()
  if (
    activeUnauthorizedRecovery
    || (lastUnauthorizedRedirectKey === dedupeKey && now - lastUnauthorizedRedirectAt < 1500)
  ) {
    return true
  }

  lastUnauthorizedRedirectKey = dedupeKey
  lastUnauthorizedRedirectAt = now

  activeUnauthorizedRecovery = (async () => {
    try {
      const { signOut } = useAuth()
      try {
        await signOut()
      } catch {
        // Best effort; local state is already cleared by useAuth().signOut()
      }

      await navigateTo(redirectTo)
    } finally {
      activeUnauthorizedRecovery = null
    }
  })()

  await activeUnauthorizedRecovery
  return true
}
