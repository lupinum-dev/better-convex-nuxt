/**
 * Server-side plugin for SSR authentication
 *
 * This plugin runs during SSR to:
 * 1. Read the session cookie from the request
 * 2. Exchange the session cookie for a JWT token via Better Auth API
 * 3. Store the token and user data in useState for client hydration
 *
 * This ensures authenticated state is available on first render with zero flash.
 */

import { defineNuxtPlugin, useState, useRuntimeConfig, useRequestEvent } from '#app'
import { createModuleLogger, getLoggingOptions, createTimer } from './utils/logger'
import type { PluginInitEvent, AuthChangeEvent } from './utils/logger'

interface ConvexUser {
  id: string
  name: string
  email: string
  emailVerified?: boolean
  image?: string
  createdAt?: string
  updatedAt?: string
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
  const hasSessionCookie = cookieHeader?.includes('better-auth.session_token')

  // Check if we have a session cookie
  if (!cookieHeader || !hasSessionCookie) {
    logger.event({
      event: 'plugin:init',
      env: 'server',
      config: { url: convexUrl || '', siteUrl, authEnabled: true },
      duration_ms: initTimer(),
      outcome: 'success',
    } satisfies PluginInitEvent)
    return
  }

  try {
    // Fetch token from auth server
    const tokenResponse = await $fetch<{ token?: string }>(`${siteUrl}/api/auth/convex/token`, {
      headers: { Cookie: cookieHeader },
    }).catch(() => null)

    // Set token if available
    if (tokenResponse?.token) {
      convexToken.value = tokenResponse.token

      // Decode JWT to extract user info (avoid second request)
      try {
        const payloadBase64 = tokenResponse.token.split('.')[1]
        if (payloadBase64) {
          const payload = JSON.parse(atob(payloadBase64))
          if (payload.sub || payload.userId || payload.email) {
            convexUser.value = {
              id: payload.sub || payload.userId || '',
              name: payload.name || '',
              email: payload.email || '',
              emailVerified: payload.emailVerified,
              image: payload.image,
            }
          }
        }
      } catch {
        // Fallback: fetch session if JWT decode fails
        const sessionResponse = await $fetch<{ user?: ConvexUser }>(
          `${siteUrl}/api/auth/get-session`,
          { headers: { Cookie: cookieHeader } },
        ).catch(() => null)
        if (sessionResponse?.user) {
          convexUser.value = sessionResponse.user
        }
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
