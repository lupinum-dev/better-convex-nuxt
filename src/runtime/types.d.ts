import type { createAuthClient } from 'better-auth/vue'
import type { ConvexClient } from 'convex/browser'

type AuthClient = ReturnType<typeof createAuthClient>

/**
 * Convex module public runtime config
 */
export interface ConvexPublicRuntimeConfig {
  /** Convex deployment URL (WebSocket) */
  url?: string
  /** Convex site URL (HTTP/Auth) */
  siteUrl?: string
  /** Routes that should skip auth checks */
  skipAuthRoutes?: string[]
  /** Logging options */
  logging?: {
    enabled?: boolean | 'debug'
    format?: 'pretty' | 'json'
  }
  /** Index signature for compatibility with Record<string, unknown> */
  [key: string]: unknown
}

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

declare module 'nuxt/schema' {
  interface PublicRuntimeConfig {
    convex?: ConvexPublicRuntimeConfig
  }
  interface RuntimeConfig {
    convexDevtoolsPath?: string
  }
  interface NuxtConfig {
    convex?: ConvexPublicRuntimeConfig
  }
  interface NuxtOptions {
    convex?: ConvexPublicRuntimeConfig
  }
}

export {}
