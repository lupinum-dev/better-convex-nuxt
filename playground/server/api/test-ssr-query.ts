import type { H3Event } from 'h3'
import { defineEventHandler, createError } from 'h3'
import { useRuntimeConfig } from '#imports'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../../convex/_generated/api'

export default defineEventHandler(async (event: H3Event) => {
  const config = useRuntimeConfig(event)
  const convexUrl = config.public.convex?.url
  const siteUrl = config.public.convex?.siteUrl || config.public.convex?.auth?.url

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
    const tokenResponse = await $fetch<{ token?: string }>(`${siteUrl}/api/auth/convex/token`, {
      headers: { Cookie: cookieHeader },
    })
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
