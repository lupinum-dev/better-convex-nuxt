/**
 * Auth transport layer for better-convex-nuxt.
 *
 * This module creates the Better Auth client and wraps it in an `AuthTransport`
 * that the auth engine can call to resolve tokens. The transport is a pure data
 * layer — it fetches tokens and returns `ClientAuthStateResult` objects but
 * never mutates Nuxt reactive state directly. All state commits happen in the
 * engine (`auth-engine.ts`).
 *
 * Token resolution follows a priority waterfall:
 * 1. Skip (route excluded from auth, signal aborted, SSR with no session)
 * 2. Hydrated token (SSR-rendered token still in state, non-forced request)
 * 3. Recent token cache (forced request but token validated recently & not expiring)
 * 4. Token exchange (HTTP call to Better Auth `/api/auth/convex/token`)
 *
 * The `onCommit` callback on results defers cache timestamp updates until the
 * engine confirms the result is not stale (operationId still matches).
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
import type { Router } from 'vue-router'

import {
  buildAuthTokenDecodeFailureMessage,
  buildClientAuthRequestFailureMessage,
  buildClientAuthResponseErrorMessage,
} from '../utils/auth-errors'
import {
  TOKEN_CACHE_MS,
  TOKEN_EXPIRY_SAFETY_BUFFER_MS,
} from '../utils/constants'
import {
  decodeUserFromJwt,
  getJwtTimeUntilExpiryMs,
} from '../utils/convex-shared'
import type { Logger } from '../utils/logger'
import { matchesSkipRoute } from '../utils/route-matcher'
import type { ConvexUser } from '../utils/types'
import type {
  AuthTransport,
  ClientAuthStateResult,
} from './auth-engine'

interface MinimalNuxtApp {
  payload?: { serverRendered?: boolean }
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
  convexUser: Ref<unknown>
  logger: Logger
  nuxtApp: MinimalNuxtApp
  router: Router
  traceId: string
}

/**
 * Validate and narrow a hydrated user value from Nuxt state.
 *
 * During SSR hydration, `convexUser` may contain any shape — including
 * arrays, strings, or objects without an `id`. This function ensures
 * we only return a ConvexUser when the value is structurally valid.
 */
function normalizeHydratedUser(user: unknown): ConvexUser | null {
  if (!user || typeof user !== 'object') {
    return null
  }

  const candidate = user as Partial<ConvexUser>
  return typeof candidate.id === 'string' ? (candidate as ConvexUser) : null
}

function buildAuthenticatedResult(
  source: ClientAuthStateResult['source'],
  token: string,
  user: ConvexUser,
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

/**
 * Create the Better Auth client and its transport interface.
 *
 * Returns an `AuthTransport` the engine wires via `configureTransport()`.
 * The transport captures closed-over mutable state (`lastTokenValidation`,
 * `inflightFetch`) — these are scoped to one NuxtApp instance via the
 * engine's WeakMap lifecycle.
 *
 * @param convexClientInstance - The ConvexClient to wire `setAuth()` calls into.
 * @param options - Auth configuration including routes, logger, and hydrated refs.
 */
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

  /**
   * Core token resolution logic — walks the priority waterfall:
   * skip → hydrated → cache → exchange.
   *
   * Returns a `ClientAuthStateResult` with an optional `onCommit` callback.
   * The engine calls `onCommit` only when the result is committed (not stale),
   * so cache timestamps are never prematurely updated.
   */
  const doFetchAuthState = async ({
    forceRefreshToken,
    signal,
  }: {
    forceRefreshToken: boolean
    signal?: AbortSignal
  }): Promise<ClientAuthStateResult> => {
    const route = router.currentRoute.value
    const routePath = route?.path ?? '/'

    logger.auth({
      phase: 'client-fetchToken:start',
      outcome: 'success',
      details: {
        traceId,
        path: routePath,
        forceRefreshToken,
        hasHydratedToken: Boolean(convexToken.value),
        hasHydratedUser: Boolean(normalizeHydratedUser(convexUser.value)),
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

    if (route?.meta?.skipConvexAuth === true) {
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

    // Priority 2: Use hydrated token if present and not forced to refresh
    if (convexToken.value && !forceRefreshToken) {
      logger.auth({
        phase: 'client-fetchToken:cache',
        outcome: 'success',
        details: { traceId, source: 'hydrated-token', path: routePath },
      })
      const result = syncHydratedAuthFromToken('hydrated-token', routePath)
      if (result.token !== null) {
        result.onCommit = () => { lastTokenValidation = Date.now() }
      }
      return result
    }

    // Priority 3: Reuse recently-validated token even on forced refresh,
    // but only if it won't expire before the safety buffer elapses.
    const timeSinceValidation = Date.now() - lastTokenValidation
    if (convexToken.value && forceRefreshToken && timeSinceValidation < TOKEN_CACHE_MS) {
      const tokenTimeUntilExpiryMs = getJwtTimeUntilExpiryMs(convexToken.value)
      const canReuseToken =
        tokenTimeUntilExpiryMs === null
        || (
          tokenTimeUntilExpiryMs > TOKEN_EXPIRY_SAFETY_BUFFER_MS
          && timeSinceValidation
          < Math.min(TOKEN_CACHE_MS, tokenTimeUntilExpiryMs - TOKEN_EXPIRY_SAFETY_BUFFER_MS)
        )

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
          result.onCommit = () => { lastTokenValidation = Date.now() }
        }
        return result
      }
    }

    // SSR rendered without a session — skip the exchange to avoid an
    // unnecessary network round-trip for a definitely-unauthenticated user.
    const wasServerRendered = Boolean(nuxtApp.payload?.serverRendered)
    if (wasServerRendered && !convexToken.value && !normalizeHydratedUser(convexUser.value) && !forceRefreshToken) {
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
              typeof response.error === 'object'
                && response.error !== null
                && 'message' in response.error
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

        return buildUnauthenticatedResult('exchange', error)
      }

      const token = response.data.token
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
        onCommit: () => { lastTokenValidation = Date.now() },
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

  /**
   * Deduplicating wrapper around `doFetchAuthState`.
   *
   * A non-forced request can reuse any in-flight fetch. A forced request
   * can only reuse an in-flight that is itself forced — this prevents a
   * forced refresh from returning a stale cached result.
   */
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

  // --- Transport interface ---
  // install: wire initial auth into ConvexClient (called once at startup)
  // refresh: force a full re-auth cycle through ConvexClient.setAuth
  // invalidate: clear ConvexClient's auth and reset local cache state
  return {
    client: authClient,
    fetchAuthState,
    install(fetchToken, onChange) {
      convexClientInstance.setAuth(fetchToken, onChange)
    },
    async refresh(fetchToken, onChange) {
      // Reset cache so the next fetch always hits the exchange
      lastTokenValidation = 0
      await new Promise<void>((resolve) => {
        convexClientInstance.setAuth(
          (input) => fetchToken({ ...input, forceRefreshToken: true }),
          () => {
            onChange(Boolean(convexToken.value && normalizeHydratedUser(convexUser.value)))
            resolve()
          },
        )
      })
    },
    async invalidate() {
      // Reset all local state — no stale cache or in-flight fetch survives
      lastTokenValidation = 0
      inflightFetch = null
      inflightIsForced = false
      await new Promise<void>((resolve) => {
        convexClientInstance.setAuth(async () => null, () => resolve())
      })
    },
  }
}
