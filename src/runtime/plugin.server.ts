/**
 * Server-side plugin for SSR authentication
 *
 * This plugin runs during SSR to:
 * 1. Read the session cookie from the request
 * 2. Exchange the session cookie for a JWT token via Better Auth API
 *    (with optional caching to reduce TTFB)
 * 3. Store the token and user data in useState for client hydration
 *
 * This ensures authenticated state is available on first render with zero flash.
 */

import { defineNuxtPlugin, useState, useRuntimeConfig, useRequestEvent } from '#app'
import { createModuleLogger, getLoggingOptions, createTimer } from './utils/logger'
import type { PluginInitEvent, AuthChangeEvent } from './utils/logger'
import { getCachedAuthToken, setCachedAuthToken } from './server/utils/auth-cache'
import type { ConvexUser } from './utils/types'
import { getCookie } from './utils/shared-helpers'

/** Session cookie name used by Better Auth */
const SESSION_COOKIE_NAME = 'better-auth.session_token'

/**
 * Decode user info from JWT payload
 */
function decodeUserFromJwt(token: string): ConvexUser | null {
  try {
    const payloadBase64 = token.split('.')[1]
    if (payloadBase64) {
      // Use Buffer instead of atob for cross-environment compatibility (Node, Edge, etc.)
      const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf-8'))
      if (payload.sub || payload.userId || payload.email) {
        return {
          id: payload.sub || payload.userId || '',
          name: payload.name || '',
          email: payload.email || '',
          emailVerified: payload.emailVerified,
          image: payload.image,
        }
      }
    }
  } catch {
    // Ignore decode errors
  }
  return null
}

export default defineNuxtPlugin(async () => {
  const config = useRuntimeConfig()
  const loggingOptions = getLoggingOptions(config.public.convex ?? {})
  const logger = createModuleLogger(loggingOptions)
  const initTimer = createTimer()

  // Get the H3 event for accessing cookies
  const event = useRequestEvent()
  if (!event) {
    logger.event({
      event: 'plugin:init',
      env: 'server',
      config: { url: '', siteUrl: '', authEnabled: false },
      duration_ms: initTimer(),
      outcome: 'error',
      error: { type: 'SSRError', message: 'No request event available' },
    } satisfies PluginInitEvent)
    return
  }

  const convexUrl = config.public.convex?.url as string | undefined
  const siteUrl = config.public.convex?.siteUrl as string | undefined

  if (!siteUrl) {
    // No auth configured - not an error, just no auth
    logger.event({
      event: 'plugin:init',
      env: 'server',
      config: { url: convexUrl || '', siteUrl: '', authEnabled: false },
      duration_ms: initTimer(),
      outcome: 'success',
    } satisfies PluginInitEvent)
    return
  }

  // Initialize useState for hydration (must be done even if unauthenticated)
  const convexToken = useState<string | null>('convex:token', () => null)
  const convexUser = useState<ConvexUser | null>('convex:user', () => null)

  // Get all cookies to forward
  const cookieHeader = event.headers.get('cookie')
  const sessionToken = getCookie(cookieHeader, SESSION_COOKIE_NAME)

  // Check if we have a session cookie
  if (!cookieHeader || !sessionToken) {
    logger.event({
      event: 'plugin:init',
      env: 'server',
      config: { url: convexUrl || '', siteUrl, authEnabled: true },
      duration_ms: initTimer(),
      outcome: 'success',
    } satisfies PluginInitEvent)
    return
  }

  // Get auth cache config
  const authCacheConfig = (config.public.convex as { authCache?: { enabled: boolean; ttl: number } })
    ?.authCache

  try {
    let token: string | null = null

    // Try cache first if enabled and we have a session token
    if (authCacheConfig?.enabled && sessionToken) {
      token = await getCachedAuthToken(sessionToken)
      if (token) {
        // Cache hit - use cached token
        convexToken.value = token
        convexUser.value = decodeUserFromJwt(token)

        logger.event({
          event: 'auth:change',
          env: 'server',
          from: 'unauthenticated',
          to: 'authenticated',
          trigger: 'init',
          user_id: convexUser.value?.id?.slice(0, 8),
        } satisfies AuthChangeEvent)

        logger.event({
          event: 'plugin:init',
          env: 'server',
          config: { url: convexUrl || '', siteUrl, authEnabled: true },
          duration_ms: initTimer(),
          outcome: 'success',
        } satisfies PluginInitEvent)
        return
      }
    }

    // Cache miss or caching disabled - fetch from auth server
    const tokenResponse = await $fetch<{ token?: string }>(`${siteUrl}/api/auth/convex/token`, {
      headers: { Cookie: cookieHeader },
    }).catch(() => null)

    // Set token if available
    if (tokenResponse?.token) {
      token = tokenResponse.token
      convexToken.value = token

      // Decode user from JWT
      convexUser.value = decodeUserFromJwt(token)

      // If decode failed, fallback to session endpoint
      if (!convexUser.value) {
        const sessionResponse = await $fetch<{ user?: ConvexUser }>(
          `${siteUrl}/api/auth/get-session`,
          { headers: { Cookie: cookieHeader } },
        ).catch(() => null)
        if (sessionResponse?.user) {
          convexUser.value = sessionResponse.user
        }
      }

      // Cache the token if caching is enabled
      if (authCacheConfig?.enabled && sessionToken && token) {
        const ttl = authCacheConfig.ttl ?? 900
        await setCachedAuthToken(sessionToken, token, ttl)
      }

      // Log successful auth
      logger.event({
        event: 'auth:change',
        env: 'server',
        from: 'unauthenticated',
        to: 'authenticated',
        trigger: 'init',
        user_id: convexUser.value?.id?.slice(0, 8),
      } satisfies AuthChangeEvent)
    }

    logger.event({
      event: 'plugin:init',
      env: 'server',
      config: { url: convexUrl || '', siteUrl, authEnabled: true },
      duration_ms: initTimer(),
      outcome: 'success',
    } satisfies PluginInitEvent)
  } catch (error) {
    // Token exchange failed - session may be invalid/expired
    convexToken.value = null
    convexUser.value = null

    logger.event({
      event: 'plugin:init',
      env: 'server',
      config: { url: convexUrl || '', siteUrl, authEnabled: true },
      duration_ms: initTimer(),
      outcome: 'error',
      error: {
        type: 'AuthError',
        message: error instanceof Error ? error.message : 'Token exchange failed',
        hint: 'Session may be expired or invalid',
      },
    } satisfies PluginInitEvent)
  }
})
