/**
 * Auth transport layer for @lupinum/trellis.
 *
 * This module owns token resolution but never commits auth state directly.
 * Instead it returns `ClientAuthStateResult` objects for the engine to either
 * commit or discard once it has checked for stale operations.
 *
 * Token resolution follows a priority waterfall:
 * 1. Skip (route excluded from auth, signal aborted, SSR with no session)
 * 2. Hydrated token (SSR-rendered token still in state, non-forced request)
 * 3. Recent token cache (forced request but token validated recently & not expiring)
 * 4. Token exchange (HTTP call to Better Auth `/api/auth/convex/token`)
 *
 * `onCommit` exists because transport-side bookkeeping must not run for stale
 * results that the engine discards.
 *
 * Request deduplication: concurrent `fetchAuthState` calls share one in-flight
 * promise. A forced request never reuses a non-forced in-flight (`inflightIsForced`).
 *
 * @module auth-client
 */
import { convexClient } from '@convex-dev/better-auth/client/plugins'
import { createAuthClient } from 'better-auth/vue'
import type { ConvexClient } from 'convex/browser'
import type { Ref } from 'vue'
import type { RouteLocationNormalizedLoaded } from 'vue-router'

import { decodeUserFromJwt, getJwtTimeUntilExpiryMs } from '../../convex/shared/convex-shared.js'
import type { RuntimeObserver } from '../../observability/runtime-observer.js'
import { TOKEN_CACHE_MS, TOKEN_EXPIRY_SAFETY_BUFFER_MS } from '../../utils/constants.js'
import { matchesSkipRoute } from '../../utils/route-matcher.js'
import type { AuthSessionUser } from '../../utils/types.js'
import {
  buildAuthTokenDecodeFailureMessage,
  buildClientAuthRequestFailureMessage,
  buildClientAuthResponseErrorMessage,
} from '../shared/auth-errors.js'
import type { AuthTransport, AuthTrigger, ClientAuthStateResult } from './auth-engine.js'

interface MinimalNuxtApp {
  payload?: { serverRendered?: boolean }
}

interface MinimalRouter {
  currentRoute: Ref<RouteLocationNormalizedLoaded>
}

interface TokenResponse {
  data?: { token: string } | null
  error?: unknown
}

type AuthClientWithConvex = ReturnType<typeof createAuthClient> & {
  convex: { token: () => Promise<TokenResponse> }
}

interface AuthClientOptions {
  baseURL: string
  authRoute: string
  skipRoutes: string[]
  convexToken: Ref<string | null>
  convexUser: Ref<AuthSessionUser | null>
  logger: RuntimeObserver
  nuxtApp: MinimalNuxtApp
  router: MinimalRouter
  traceId: string
}

/**
 * Validate and narrow a hydrated user value from Nuxt state.
 *
 * During SSR hydration, `convexUser` may contain any shape — including
 * arrays, strings, or arbitrary objects. This function ensures we only return
 * an AuthSessionUser when the value is structurally valid.
 */
function normalizeHydratedUser(user: unknown): AuthSessionUser | null {
  if (!user || typeof user !== 'object') {
    return null
  }

  const candidate = user as Partial<AuthSessionUser>
  const hasProfileField =
    typeof candidate.email === 'string' ||
    typeof candidate.displayName === 'string' ||
    typeof candidate.avatarUrl === 'string' ||
    typeof candidate.emailVerified === 'boolean'

  return hasProfileField ? (candidate as AuthSessionUser) : null
}

function buildAuthenticatedResult(
  source: ClientAuthStateResult['source'],
  token: string,
  user: AuthSessionUser,
): ClientAuthStateResult {
  return {
    token,
    user,
    error: null,
    source,
  }
}

function buildUnauthenticatedResult(
  source: ClientAuthStateResult['source'],
  error: string | null = null,
): ClientAuthStateResult {
  return {
    token: null,
    user: null,
    error,
    source,
  }
}

export function initAuthClient(
  convexClientInstance: ConvexClient,
  options: AuthClientOptions,
): AuthTransport {
  const {
    baseURL,
    authRoute,
    skipRoutes,
    convexToken,
    convexUser,
    logger,
    nuxtApp,
    router,
    traceId,
  } = options

  const authClient = createAuthClient({
    baseURL,
    plugins: [convexClient()],
    fetchOptions: { credentials: 'include' },
  }) as AuthClientWithConvex

  let lastTokenValidation = Date.now()
  let inflightFetch: Promise<ClientAuthStateResult> | null = null
  let inflightIsForced = false
  let skipNextAnonymousSpaBootConvexSetAuthRefresh = false
  let skipNextAnonymousBootstrapRefresh =
    Boolean(nuxtApp.payload?.serverRendered) &&
    !convexToken.value &&
    !normalizeHydratedUser(convexUser.value)

  const syncHydratedAuthFromToken = (
    source: 'hydrated-token' | 'recent-token-cache',
    routePath: string,
  ): ClientAuthStateResult => {
    const token = convexToken.value
    if (!token) {
      return buildUnauthenticatedResult(source)
    }

    const hydratedUser = normalizeHydratedUser(convexUser.value)
    if (hydratedUser) {
      return buildAuthenticatedResult(source, token, hydratedUser)
    }

    const decodedUser = decodeUserFromJwt(token)
    if (!decodedUser) {
      const error = buildAuthTokenDecodeFailureMessage()
      logger.auth({
        phase: 'client-fetchToken:cache',
        outcome: 'error',
        details: {
          traceId,
          path: routePath,
          source,
          userHydrated: false,
        },
        error: new Error(error),
      })
      return buildUnauthenticatedResult(source, error)
    }

    return buildAuthenticatedResult(source, token, decodedUser)
  }

  // Walk the token waterfall: skip -> hydrated -> cache -> exchange.
  const doFetchAuthState = async ({
    forceRefreshToken,
    signal,
    trigger,
  }: {
    forceRefreshToken: boolean
    signal?: AbortSignal
    trigger?: AuthTrigger
  }): Promise<ClientAuthStateResult> => {
    const route = router.currentRoute.value
    const routePath = route?.path ?? '/'
    const hasHydratedUser = Boolean(normalizeHydratedUser(convexUser.value))

    logger.auth({
      phase: 'client-fetchToken:start',
      outcome: 'success',
      details: {
        traceId,
        path: routePath,
        forceRefreshToken,
        hasHydratedToken: Boolean(convexToken.value),
        hasHydratedUser,
        ...(forceRefreshToken ? { trigger: trigger ?? 'unknown' } : {}),
      },
    })

    if (signal?.aborted) {
      logger.auth({
        phase: 'client-fetchToken:abort',
        outcome: 'skip',
        details: { traceId, reason: 'signal-aborted-before-start', path: routePath },
      })
      return buildUnauthenticatedResult('skip')
    }

    if (route?.meta?.skipAuthTokenFetch === true) {
      logger.auth({
        phase: 'client-fetchToken:skip',
        outcome: 'skip',
        details: { traceId, reason: 'page-meta-skip', path: routePath },
      })
      return buildUnauthenticatedResult('skip')
    }

    if (matchesSkipRoute(routePath, skipRoutes)) {
      logger.auth({
        phase: 'client-fetchToken:skip',
        outcome: 'skip',
        details: { traceId, reason: 'skip-auth-route', path: routePath },
      })
      return buildUnauthenticatedResult('skip')
    }

    // Hydrated SSR state wins for ordinary reads so the client avoids a flash.
    if (convexToken.value && !forceRefreshToken) {
      logger.auth({
        phase: 'client-fetchToken:cache',
        outcome: 'success',
        details: { traceId, source: 'hydrated-token', path: routePath },
      })
      const result = syncHydratedAuthFromToken('hydrated-token', routePath)
      if (result.token !== null) {
        result.onCommit = () => {
          lastTokenValidation = Date.now()
        }
      }
      return result
    }

    // Forced refresh can still reuse a fresh token if we validated it recently
    // and it will remain valid past the safety buffer.
    const timeSinceValidation = Date.now() - lastTokenValidation
    if (convexToken.value && forceRefreshToken && timeSinceValidation < TOKEN_CACHE_MS) {
      const tokenTimeUntilExpiryMs = getJwtTimeUntilExpiryMs(convexToken.value)
      const canReuseToken =
        tokenTimeUntilExpiryMs === null ||
        (tokenTimeUntilExpiryMs > TOKEN_EXPIRY_SAFETY_BUFFER_MS &&
          timeSinceValidation <
            Math.min(TOKEN_CACHE_MS, tokenTimeUntilExpiryMs - TOKEN_EXPIRY_SAFETY_BUFFER_MS))

      if (canReuseToken) {
        logger.auth({
          phase: 'client-fetchToken:cache',
          outcome: 'success',
          details: {
            traceId,
            source: 'recent-token-cache',
            ageMs: timeSinceValidation,
            path: routePath,
          },
        })
        const result = syncHydratedAuthFromToken('recent-token-cache', routePath)
        if (result.token !== null) {
          result.onCommit = () => {
            lastTokenValidation = Date.now()
          }
        }
        return result
      }
    }

    // SSR with no session is already a known unauthenticated state.
    const wasServerRendered = Boolean(nuxtApp.payload?.serverRendered)
    if (wasServerRendered && !convexToken.value && !hasHydratedUser && !forceRefreshToken) {
      logger.auth({
        phase: 'client-fetchToken:skip',
        outcome: 'skip',
        details: {
          traceId,
          reason: 'ssr-rendered-no-hydrated-session',
          path: routePath,
        },
      })
      return buildUnauthenticatedResult('skip')
    }

    if (
      forceRefreshToken &&
      skipNextAnonymousBootstrapRefresh &&
      !convexToken.value &&
      !hasHydratedUser
    ) {
      skipNextAnonymousBootstrapRefresh = false
      logger.auth({
        phase: 'client-fetchToken:skip',
        outcome: 'skip',
        details: {
          traceId,
          reason: 'ssr-rendered-no-session-bootstrap',
          path: routePath,
        },
      })
      return buildUnauthenticatedResult('skip')
    }

    if (
      forceRefreshToken &&
      trigger === 'convex-set-auth' &&
      skipNextAnonymousSpaBootConvexSetAuthRefresh &&
      !nuxtApp.payload?.serverRendered &&
      !convexToken.value &&
      !hasHydratedUser
    ) {
      skipNextAnonymousSpaBootConvexSetAuthRefresh = false
      logger.auth({
        phase: 'client-fetchToken:skip',
        outcome: 'skip',
        details: {
          traceId,
          reason: 'spa-anonymous-client-init-already-settled',
          trigger,
          path: routePath,
        },
      })
      return buildUnauthenticatedResult('skip')
    }

    try {
      logger.auth({
        phase: 'client-fetchToken:request',
        outcome: 'success',
        details: {
          traceId,
          endpoint: `${authRoute}/convex/token`,
          path: routePath,
        },
      })
      const response = await authClient.convex.token()

      if (signal?.aborted) {
        logger.auth({
          phase: 'client-fetchToken:abort',
          outcome: 'skip',
          details: { traceId, reason: 'signal-aborted-after-request', path: routePath },
        })
        return buildUnauthenticatedResult('skip')
      }

      if (response.error || !response.data?.token) {
        const error = response.error
          ? buildClientAuthResponseErrorMessage(
              typeof response.error === 'object' &&
                response.error !== null &&
                'message' in response.error
                ? String((response.error as { message: unknown }).message)
                : 'Authentication failed',
            )
          : null

        logger.auth({
          phase: 'client-fetchToken:response',
          outcome: 'miss',
          details: {
            traceId,
            path: routePath,
            hasError: Boolean(response.error),
          },
        })

        skipNextAnonymousSpaBootConvexSetAuthRefresh =
          !forceRefreshToken &&
          !nuxtApp.payload?.serverRendered &&
          !convexToken.value &&
          !hasHydratedUser &&
          error === null

        return buildUnauthenticatedResult('exchange', error)
      }

      const token = response.data.token
      skipNextAnonymousSpaBootConvexSetAuthRefresh = false
      const decodedUser = decodeUserFromJwt(token)
      if (!decodedUser) {
        const error = buildAuthTokenDecodeFailureMessage()
        logger.auth({
          phase: 'client-fetchToken:response',
          outcome: 'error',
          details: {
            traceId,
            path: routePath,
            source: 'exchange',
            userHydrated: false,
          },
          error: new Error(error),
        })
        return buildUnauthenticatedResult('exchange', error)
      }

      logger.auth({
        phase: 'client-fetchToken:response',
        outcome: 'success',
        details: {
          traceId,
          path: routePath,
          userHydrated: true,
        },
      })

      return {
        ...buildAuthenticatedResult('exchange', token, decodedUser),
        onCommit: () => {
          lastTokenValidation = Date.now()
        },
      }
    } catch (error) {
      if (signal?.aborted) {
        logger.auth({
          phase: 'client-fetchToken:abort',
          outcome: 'skip',
          details: { traceId, reason: 'signal-aborted-after-error', path: routePath },
        })
        return buildUnauthenticatedResult('skip')
      }

      const message = buildClientAuthRequestFailureMessage(error)
      logger.auth({
        phase: 'client-fetchToken:response',
        outcome: 'error',
        details: { traceId, path: routePath },
        error: error instanceof Error ? error : new Error('Authentication request failed'),
      })
      return buildUnauthenticatedResult('exchange', message)
    }
  }

  // Forced requests must not reuse a non-forced in-flight result.
  const fetchAuthState: AuthTransport['fetchAuthState'] = async (input) => {
    if (inflightFetch && (inflightIsForced || !input.forceRefreshToken)) {
      return await inflightFetch
    }

    const thisFetch = doFetchAuthState(input)
    inflightIsForced = input.forceRefreshToken
    inflightFetch = thisFetch
    try {
      return await thisFetch
    } finally {
      if (inflightFetch === thisFetch) {
        inflightFetch = null
        inflightIsForced = false
      }
    }
  }

  const installSetAuthFlow = async (
    configure: (handlers: { resolve: () => void; reject: (error: unknown) => void }) => void,
  ): Promise<void> => {
    await new Promise<void>((resolve, reject) => {
      let settled = false

      const settle = (fn: () => void) => {
        if (settled) return
        settled = true
        fn()
      }

      configure({
        resolve: () =>
          settle(() => {
            resolve()
          }),
        reject: (error) =>
          settle(() => {
            reject(error)
          }),
      })
    })
  }

  return {
    client: authClient,
    fetchAuthState,
    install(fetchToken, onChange) {
      convexClientInstance.setAuth(
        (input) => fetchToken({ ...input, trigger: 'convex-set-auth' }),
        (isAuthenticated) => onChange(isAuthenticated, { trigger: 'convex-set-auth' }),
      )
    },
    async refresh(fetchToken, onChange, options) {
      skipNextAnonymousBootstrapRefresh = false
      skipNextAnonymousSpaBootConvexSetAuthRefresh = false
      lastTokenValidation = 0
      const trigger = options?.trigger ?? 'manual-refresh'
      await installSetAuthFlow(({ resolve, reject }) => {
        const finish = (authenticated: boolean) => {
          onChange(authenticated, { trigger })
          resolve()
        }
        convexClientInstance.setAuth(
          async (input) => {
            try {
              const token = await fetchToken({ ...input, forceRefreshToken: true, trigger })
              // Some flows have no active subscriptions yet, so Convex may not
              // invoke `onChange` promptly. Resolve refresh once the forced token
              // fetch itself settles.
              finish(Boolean(token))
              return token
            } catch (error) {
              reject(error)
              return null
            }
          },
          () => {
            finish(Boolean(convexToken.value && normalizeHydratedUser(convexUser.value)))
          },
        )
      })
    },
    async invalidate() {
      lastTokenValidation = 0
      inflightFetch = null
      inflightIsForced = false
      skipNextAnonymousSpaBootConvexSetAuthRefresh = false
      await installSetAuthFlow(({ resolve }) => {
        convexClientInstance.setAuth(
          async () => {
            resolve()
            return null
          },
          () => resolve(),
        )
      })
    },
  }
}
