import type { createAuthClient } from 'better-auth/vue'
import type { ConvexClient } from 'convex/browser'

type AuthClient = ReturnType<typeof createAuthClient>

declare module '#app' {
  interface NuxtApp {
    $convex: ConvexClient
    $auth?: AuthClient
    /** Internal cache for WebSocket subscriptions (prevents duplicates) */
    _convexSubscriptions?: Record<string, () => void>
  }
}

declare module 'vue' {
  interface ComponentCustomProperties {
    $convex: ConvexClient
    $auth?: AuthClient
  }
}

export {}
