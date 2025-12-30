<template>
  <div class="container">
    <h1>SSR Auth Query Test</h1>

    <div v-if="error" class="error">Error: {{ error }}</div>

    <div v-else-if="data">
      <p><strong>SSR worked!</strong></p>
      <p>Rendered at: {{ renderedAt }}</p>
      <p>User: {{ data.displayName || data.name || 'Unknown' }}</p>
      <pre>{{ JSON.stringify(data, null, 2) }}</pre>
    </div>

    <div v-else>
      <p>No data (not authenticated?)</p>
    </div>

    <p class="meta">Rendered on: {{ renderedOn }}</p>
  </div>
</template>

<script setup lang="ts">
import { ConvexHttpClient } from 'convex/browser'
import { api } from '~/convex/_generated/api'

const config = useRuntimeConfig()

// Use useState for proper SSR -> client hydration
const data = useState<any>('ssr-test-data', () => null)
const error = useState<string | null>('ssr-test-error', () => null)
const renderedAt = useState('ssr-test-time', () => new Date().toISOString())
const renderedOn = useState('ssr-test-where', () => import.meta.server ? 'Server' : 'Client')

// Runs on server during SSR
if (import.meta.server) {
  const event = useRequestEvent()
  const cookieHeader = event?.headers.get('cookie')

  if (cookieHeader?.includes('better-auth.session_token')) {
    const siteUrl = config.public.convex?.siteUrl || config.public.convex?.auth?.url
    const convexUrl = config.public.convex?.url

    try {
      // Get JWT
      const tokenResponse = await $fetch<{ token?: string }>(
        `${siteUrl}/api/auth/convex/token`,
        { headers: { Cookie: cookieHeader } },
      )

      if (tokenResponse?.token) {
        // Make authenticated query
        const httpClient = new ConvexHttpClient(convexUrl)
        httpClient.setAuth(tokenResponse.token)

        data.value = await httpClient.query(api.users.getCurrentUser, {})
      }
    }
    catch (e) {
      error.value = String(e)
    }
  }
}
</script>

<style scoped>
.container { max-width: 600px; margin: 40px auto; padding: 20px; font-family: system-ui; }
.error { background: #fee; color: #c00; padding: 12px; border-radius: 8px; }
.meta { margin-top: 20px; color: #666; font-size: 0.9em; }
pre { background: #f5f5f5; padding: 12px; border-radius: 8px; overflow: auto; }
</style>
