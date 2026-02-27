import { navigateTo, useNuxtApp, useRoute, useRuntimeConfig } from '#imports'

import { useConvexAuth } from '../composables/useConvexAuth'
import { isConvexUnauthorizedError } from './auth-unauthorized-core'
import { normalizeConvexRuntimeConfig } from './runtime-config'

export type UnauthorizedErrorSource = 'mutation' | 'action' | 'query'

interface UnauthorizedRecoveryState {
  activeRecovery: Promise<void> | null
  lastRedirectKey: string | null
  lastRedirectAt: number
}

export function normalizeRedirectTargetPath(redirectTo: string): string {
  try {
    const normalized = new URL(redirectTo, 'http://localhost').pathname
    return normalized || '/'
  } catch {
    const pathOnly = redirectTo.split('?')[0]?.split('#')[0]
    if (!pathOnly) return '/'
    return pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`
  }
}

function getUnauthorizedRecoveryState(): UnauthorizedRecoveryState {
  const nuxtApp = useNuxtApp()
  const appWithState = nuxtApp as typeof nuxtApp & { _bcnUnauthorizedRecoveryState?: UnauthorizedRecoveryState }
  if (!appWithState._bcnUnauthorizedRecoveryState) {
    appWithState._bcnUnauthorizedRecoveryState = {
      activeRecovery: null,
      lastRedirectKey: null,
      lastRedirectAt: 0,
    }
  }
  return appWithState._bcnUnauthorizedRecoveryState
}

export async function handleUnauthorizedAuthFailure(options: {
  error: unknown
  source: UnauthorizedErrorSource
  functionName?: string
}): Promise<boolean> {
  if (import.meta.server) return false
  if (!isConvexUnauthorizedError(options.error)) return false

  const runtimeConfig = useRuntimeConfig()
  const authConfig = normalizeConvexRuntimeConfig(runtimeConfig.public.convex).auth
  const unauthorized = authConfig.unauthorized
  const recoveryState = getUnauthorizedRecoveryState()

  if (!authConfig.enabled || !unauthorized.enabled) return false
  if (options.source === 'query' && !unauthorized.includeQueries) return false

  const route = useRoute()
  const redirectTo = unauthorized.redirectTo
  const redirectPath = normalizeRedirectTargetPath(redirectTo)
  if (route.path === redirectPath) return false

  const dedupeKey = `${options.source}:${redirectPath}:${route.fullPath}`
  const now = Date.now()
  if (
    recoveryState.activeRecovery
    || (recoveryState.lastRedirectKey === dedupeKey && now - recoveryState.lastRedirectAt < 1500)
  ) {
    return true
  }

  recoveryState.lastRedirectKey = dedupeKey
  recoveryState.lastRedirectAt = now

  recoveryState.activeRecovery = (async () => {
    try {
      const { signOut } = useConvexAuth()
      try {
        await signOut()
      } catch {
        // Best effort; local state is already cleared by useConvexAuth().signOut()
      }

      await navigateTo(redirectTo)
    } finally {
      recoveryState.activeRecovery = null
    }
  })()

  await recoveryState.activeRecovery
  return true
}
