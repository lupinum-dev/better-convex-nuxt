import { useNuxtApp, useRuntimeConfig } from '#imports'

import { normalizeConvexRuntimeConfig } from '../../convex/shared/runtime-config.js'
import { UNAUTHORIZED_REDIRECT_DEBOUNCE_MS } from '../../utils/constants.js'
import { getSharedAuthEngine } from '../client/auth-engine.js'
import { isConvexUnauthorizedError } from './auth-unauthorized-core.js'

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
  const appWithState = nuxtApp as typeof nuxtApp & {
    _bcnUnauthorizedRecoveryState?: UnauthorizedRecoveryState
  }
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

  const nuxtApp = useNuxtApp()

  // Skip redirect when the user is currently authenticated. A 401/403 from
  // Convex while authenticated means a business-logic permission denial (e.g.
  // "not an admin"), not a session expiry. Redirecting to the login page in
  // that case would be a false positive.
  try {
    const engine = getSharedAuthEngine(nuxtApp)
    if (engine.isAuthenticated.value) return false
  } catch {
    // Engine not initialized — fall through to redirect logic.
  }
  const router = nuxtApp.$router as
    | { currentRoute?: { value?: { path?: string; fullPath?: string } } }
    | undefined
  const routerRoute = router?.currentRoute?.value
  const locationLike = (globalThis as { location?: Location }).location
  const currentRoute = routerRoute ?? {
    path: locationLike?.pathname ?? '/',
    fullPath: `${locationLike?.pathname ?? '/'}${locationLike?.search ?? ''}${locationLike?.hash ?? ''}`,
  }
  const redirectTo = unauthorized.redirectTo
  const redirectPath = normalizeRedirectTargetPath(redirectTo)
  if (currentRoute.path === redirectPath) return false

  const dedupeKey = `${options.source}:${redirectPath}:${currentRoute.fullPath}`
  const now = Date.now()
  if (
    recoveryState.activeRecovery ||
    (recoveryState.lastRedirectKey === dedupeKey &&
      now - recoveryState.lastRedirectAt < UNAUTHORIZED_REDIRECT_DEBOUNCE_MS)
  ) {
    return true
  }

  recoveryState.lastRedirectKey = dedupeKey
  recoveryState.lastRedirectAt = now

  recoveryState.activeRecovery = (async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await nuxtApp.callHook('trellis:unauthorized' as any, {
        error: options.error,
        source: options.source,
        functionName: options.functionName,
        redirectTo,
      })
    } finally {
      recoveryState.activeRecovery = null
    }
  })()

  await recoveryState.activeRecovery
  return true
}
