import { watch } from 'vue'

/**
 * Client-side Convex plugin with SSR token hydration.
 * Orchestrates auth setup for zero-flash auth on first render.
 */
import { defineNuxtPlugin, useRuntimeConfig, useState, useRouter } from '#app'

import { initAuthClient } from './client/auth-client'
import { createSharedAuthEngine } from './client/auth-engine'
import { initHydrationState } from './client/auth-hydration'
import { initConvexClient } from './client/convex-client'
import { initRuntimeConnectionHooks } from './client/runtime-hooks'
import { setDevtoolsStore } from './devtools/runtime'
import { useAuthBootstrapDevtoolsState, usePermissionDevtoolsState } from './devtools/state'
import { ConvexDevtoolsStore } from './devtools/store'
import { buildMissingSiteUrlMessage } from './utils/auth-errors'
import { STATE_KEY_AUTH_TRACE_ID } from './utils/constants'
import { createLogger, getLogLevel } from './utils/logger'
import { getConvexRuntimeConfig } from './utils/runtime-config'
import type { ConvexUser } from './utils/types'

type HydrationState = ReturnType<typeof initHydrationState>
type ClientDevtoolsApp = {
  provide: (name: string, value: unknown) => void
}

export function setupClientDevtools(
  nuxtApp: ClientDevtoolsApp,
  client: ReturnType<typeof initConvexClient>,
  hydration: HydrationState,
): ConvexDevtoolsStore {
  const store = new ConvexDevtoolsStore()
  setDevtoolsStore(store)
  nuxtApp.provide('convexDevtoolsStore', store)

  store.updateAuthState(hydration.convexToken, hydration.convexUser)
  watch(hydration.convexToken, () =>
    store.updateAuthState(hydration.convexToken, hydration.convexUser),
  )
  watch(hydration.convexUser, () =>
    store.updateAuthState(hydration.convexToken, hydration.convexUser),
  )

  if (hydration.convexAuthWaterfall.value) {
    store.setAuthWaterfall(hydration.convexAuthWaterfall.value)
  }
  watch(hydration.convexAuthWaterfall, (w: typeof hydration.convexAuthWaterfall.value) =>
    store.setAuthWaterfall(w),
  )

  store.updateConnectionState(client)
  const connectionInterval = import.meta.client
    ? setInterval(() => store.updateConnectionState(client), 2000)
    : null

  const permissionState = usePermissionDevtoolsState()
  const authBootstrapState = useAuthBootstrapDevtoolsState()
  store.setPermissionContextState(permissionState.value)
  store.setAuthBootstrapState(authBootstrapState.value)
  watch(permissionState, (s: typeof permissionState.value) => store.setPermissionContextState(s), {
    deep: true,
  })
  watch(
    authBootstrapState,
    (s: typeof authBootstrapState.value) => store.setAuthBootstrapState(s),
    { deep: true },
  )

  const hot = (import.meta as unknown as Record<string, unknown>).hot as
    | { dispose: (fn: () => void) => void }
    | undefined
  if (hot && connectionInterval !== null) {
    hot.dispose(() => clearInterval(connectionInterval))
  }

  return store
}

export default defineNuxtPlugin({
  name: 'better-convex-nuxt:client',
  setup(nuxtApp) {
    const config = useRuntimeConfig()
    const convexConfig = getConvexRuntimeConfig()
    const publicConvex = config.public.convex as Record<string, unknown> | undefined
    const logLevel = getLogLevel(publicConvex)
    const logger = createLogger(logLevel)
    const endInit = logger.time('plugin:init (client)')

    // HMR-safe initialization
    if (nuxtApp.$convex) {
      logger.debug('plugin:init (client) skipped; already initialized')
      return
    }

    const convexUrl = convexConfig.url
    const authConfig = convexConfig.auth
    const isAuthEnabled = authConfig.enabled
    const resolvedSiteUrl = convexConfig.siteUrl
    const hydration = initHydrationState()
    const wasAuthenticated = useState<boolean>('better-convex:was-authenticated', () =>
      Boolean(hydration.convexToken.value && hydration.convexUser.value),
    )
    const traceId = import.meta.dev
      ? (useState<string>(STATE_KEY_AUTH_TRACE_ID).value ?? 'unknown')
      : 'prod'
    const authEngine = createSharedAuthEngine({
      nuxtApp,
      token: hydration.convexToken,
      user: hydration.convexUser as typeof hydration.convexUser & { value: ConvexUser | null },
      pending: hydration.convexPending,
      rawAuthError: hydration.convexAuthError,
      wasAuthenticated,
      onSetAuthState: (isAuthenticated, meta) => {
        logger.auth({
          phase: 'client-setAuth',
          outcome: 'success',
          details: {
            traceId,
            state: isAuthenticated ? 'authenticated' : 'unauthenticated',
            hasToken: Boolean(hydration.convexToken.value),
            hasUser: Boolean(hydration.convexUser.value),
            ...(meta?.trigger ? { trigger: meta.trigger } : {}),
          },
        })
      },
      resolveInitialAuth: hydration.resolveInitialAuth,
    })

    if (!convexUrl) {
      const missingUrlMessage =
        'Convex URL not configured. Set `convex.url` or provide `CONVEX_URL` / `NUXT_PUBLIC_CONVEX_URL`.'
      authEngine.initialize({
        error: missingUrlMessage,
        resolveInitialAuth: true,
      })
      logger.auth({ phase: 'init', outcome: 'error', error: new Error(missingUrlMessage) })
      endInit()
      return
    }

    logger.auth({
      phase: 'client-init',
      outcome: 'success',
      details: {
        traceId,
        serverRendered: Boolean(nuxtApp.payload?.serverRendered),
        authEnabled: Boolean(isAuthEnabled),
      },
    })

    const client = initConvexClient(convexUrl)

    if (isAuthEnabled && resolvedSiteUrl) {
      const authRoute = authConfig.route
      const authBaseURL =
        typeof window !== 'undefined' ? `${window.location.origin}${authRoute}` : authRoute
      const router = useRouter()

      authEngine.configureTransport(
        initAuthClient(client, {
          baseURL: authBaseURL,
          authRoute,
          skipRoutes: authConfig.skipAuthRoutes,
          convexToken: hydration.convexToken,
          convexUser: hydration.convexUser,
          logger,
          nuxtApp,
          router,
          traceId,
        }),
      )
    } else if (isAuthEnabled) {
      const missingSiteUrlMessage = buildMissingSiteUrlMessage(convexUrl)
      authEngine.initialize({
        error: missingSiteUrlMessage,
        resolveInitialAuth: true,
      })
      logger.auth({
        phase: 'client-init',
        outcome: 'error',
        error: new Error(missingSiteUrlMessage),
        details: { traceId },
      })
    } else {
      authEngine.initialize({ resolveInitialAuth: true })
    }

    nuxtApp.provide('convex', client)
    initRuntimeConnectionHooks(nuxtApp, client, logger)
    if (authEngine.client) {
      nuxtApp.provide('auth', authEngine.client)
    }

    if (import.meta.dev) {
      setupClientDevtools(nuxtApp, client, hydration)

      // Expose subscription cache for console inspection
      void import('./utils/convex-cache').then(({ getSubscriptionCache }) => {
        ;(window as unknown as Record<string, unknown>).__CONVEX_SUBSCRIPTIONS__ = () =>
          getSubscriptionCache(nuxtApp as Parameters<typeof getSubscriptionCache>[0])
      })
    }

    endInit()

    if (hydration.convexToken.value) {
      logger.auth({ phase: 'hydrate', outcome: 'success', details: { source: 'ssr' } })
    } else if (isAuthEnabled) {
      logger.auth({
        phase: 'hydrate',
        outcome: 'miss',
        details: { traceId, source: 'client-init' },
      })
    } else {
      logger.debug('Client initialized (auth disabled)')
    }
  },
})
