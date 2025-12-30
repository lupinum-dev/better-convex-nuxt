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

interface ConvexUser {
  id: string
  name: string
  email: string
  emailVerified?: boolean
  image?: string
  createdAt?: string
  updatedAt?: string
}

// Verbose logging helper for SSR debugging
const log = (message: string, data?: unknown) => {
  if (import.meta.dev) {
    const prefix = '[bcn:ssr] '
    if (data !== undefined) {
      console.log(prefix + message, data)
    } else {
      console.log(prefix + message)
    }
  }
}

export default defineNuxtPlugin(async () => {
  log('Plugin starting')

  // Get the H3 event for accessing cookies
  const event = useRequestEvent()
  if (!event) {
    log('No request event available, skipping')
    return
  }

  const config = useRuntimeConfig()
  // Use siteUrl (preferred) or fall back to auth.url for backwards compatibility
  const siteUrl = config.public.convex?.siteUrl || config.public.convex?.auth?.url

  if (!siteUrl) {
    log('No siteUrl configured, skipping auth')
    return
  }

  log('Auth configured', { siteUrl })

  // Initialize useState for hydration (must be done even if unauthenticated)
  const convexToken = useState<string | null>('convex:token', () => null)
  const convexUser = useState<ConvexUser | null>('convex:user', () => null)

  // Get all cookies to forward (like Next.js pattern)
  const cookieHeader = event.headers.get('cookie')
  const hasSessionCookie = cookieHeader?.includes('better-auth.session_token')

  log('Cookie check', { hasCookieHeader: !!cookieHeader, hasSessionCookie })

  // Check if we have a session cookie
  if (!cookieHeader || !hasSessionCookie) {
    log('No session cookie, remaining unauthenticated')
    return
  }

  try {
    log('Fetching token from auth server')

    // OPTIMIZATION: Only fetch the token endpoint, not the session separately.
    // The /convex/token endpoint already validates the session internally,
    // and the JWT contains user data in its payload. We decode it to get user info.
    // This reduces Better Auth adapter calls from 2 parallel requests to 1.
    const tokenResponse = await $fetch<{ token?: string }>(`${siteUrl}/api/auth/convex/token`, {
      headers: { Cookie: cookieHeader },
    }).catch((err) => {
      log('Token fetch failed', { error: err?.message || err })
      return null
    })

    // Set token if available
    if (tokenResponse?.token) {
      convexToken.value = tokenResponse.token
      log('Token set successfully')

      // Decode JWT to extract user info (avoid second request)
      // JWT format: header.payload.signature
      try {
        const payloadBase64 = tokenResponse.token.split('.')[1]
        if (payloadBase64) {
          const payload = JSON.parse(atob(payloadBase64))
          // The Convex Better Auth plugin includes user fields in the JWT payload
          // See: jwt.definePayload in the convex plugin
          if (payload.sub || payload.userId || payload.email) {
            convexUser.value = {
              id: payload.sub || payload.userId || '',
              name: payload.name || '',
              email: payload.email || '',
              emailVerified: payload.emailVerified,
              image: payload.image,
            }
            log('User extracted from JWT', {
              userId: convexUser.value.id,
              email: convexUser.value.email,
            })
          }
        }
      } catch (decodeError) {
        log('JWT decode failed, fetching session separately', { error: decodeError })
        // Fallback: fetch session if JWT decode fails
        const sessionResponse = await $fetch<{ user?: ConvexUser }>(
          `${siteUrl}/api/auth/get-session`,
          {
            headers: { Cookie: cookieHeader },
          },
        ).catch(() => null)
        if (sessionResponse?.user) {
          convexUser.value = sessionResponse.user
          log('User set from session fallback', { userId: sessionResponse.user.id })
        }
      }
    } else {
      log('No token in response')
    }

    log('SSR auth complete', {
      isAuthenticated: !!(convexToken.value && convexUser.value),
    })
  } catch (error) {
    // Token exchange failed - session may be invalid/expired
    // Gracefully remain unauthenticated without breaking SSR
    log('Token exchange failed', { error: error instanceof Error ? error.message : error })
    convexToken.value = null
    convexUser.value = null
  }
})
