import { ConvexHttpClient } from 'convex/browser'
import type { H3Event } from 'h3'
import { defineEventHandler, createError } from 'h3'

import { api } from '#convex/api'
import { useRuntimeConfig } from '#imports'

export default defineEventHandler(async (event: H3Event) => {
  const config = useRuntimeConfig(event)
  const publicConvex = config.public.convex as
    | {
        url?: string
        siteUrl?: string
        auth?: {
          url?: string
        }
      }
    | undefined
  const convexUrl = publicConvex?.url
  const siteUrl = publicConvex?.siteUrl || publicConvex?.auth?.url

  if (!convexUrl || !siteUrl) {
    throw createError({ statusCode: 500, message: 'Convex not configured' })
  }

  // Step 1: Get cookies from request
  const cookieHeader = event.headers.get('cookie')
  if (!cookieHeader?.includes('better-auth.session_token')) {
    return { authenticated: false, message: 'No session cookie' }
  }

  // Step 2: Exchange session for JWT
  let token: string | null = null
  try {
    const tokenResponse = (await $fetch(`${siteUrl}/api/auth/convex/token`, {
      headers: { Cookie: cookieHeader },
    })) as { token?: string }
    token = tokenResponse?.token ?? null
  } catch (e) {
    return { authenticated: false, message: 'Failed to get token', error: String(e) }
  }

  if (!token) {
    return { authenticated: false, message: 'No token returned' }
  }

  // Step 3: Create HTTP client with auth
  const httpClient = new ConvexHttpClient(convexUrl)
  httpClient.setAuth(token)

  // Step 4: Try authenticated query
  try {
    const result = await httpClient.query(api.users.getCurrentUser, {})
    return {
      authenticated: true,
      ssrWorked: true,
      data: result,
    }
  } catch (e) {
    return {
      authenticated: true,
      ssrWorked: false,
      message: 'Query failed',
      error: String(e),
    }
  }
})
