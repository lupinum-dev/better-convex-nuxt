import type { createAuthClient } from 'better-auth/vue'
import type { ConvexClient } from 'convex/browser'
import type { RouteLocationRaw } from 'vue-router'
import type { LogLevel } from './utils/logger'
import type { ConvexAuthConfigInput } from './utils/auth-config'

type AuthClient = ReturnType<typeof createAuthClient>

/**
 * Convex module public runtime config
 */
export interface ConvexPublicRuntimeConfig {
  /** Convex deployment URL (WebSocket) */
  url?: string
  /** Convex site URL (HTTP/Auth) */
  siteUrl?: string
  /** Auth integration config */
  auth?: boolean | ConvexAuthConfigInput
  /** Auth proxy route path */
  authRoute?: string
  /** Additional trusted origins for auth proxy CORS */
  trustedOrigins?: string[]
  /** Routes that should skip auth checks */
  skipAuthRoutes?: string[]
  /** Whether permissions helper mode is enabled */
  permissions?: boolean
  /** Logging level */
  logging?: LogLevel
  /** SSR auth cache config */
  authCache?: {
    enabled?: boolean
    ttl?: number
  }
  /** Global query defaults */
  defaults?: {
    server?: boolean
    lazy?: boolean
    subscribe?: boolean
    public?: boolean
  }
  /** Optional debug channels for high-verbosity traces */
  debug?: {
    authFlow?: boolean
    clientAuthFlow?: boolean
    serverAuthFlow?: boolean
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
    /** Internal dedupe state for unauthorized query/action/mutation recovery */
    _bcnUnauthorizedRecoveryState?: {
      activeRecovery: Promise<void> | null
      lastRedirectKey: string | null
      lastRedirectAt: number
    }
    /** Internal in-flight promise for useConvexAuth().refreshAuth() dedupe */
    _convexRefreshAuthPromise?: Promise<void> | null
  }
  interface PageMeta {
    skipConvexAuth?: boolean
    convexAuth?: boolean | { redirectTo?: RouteLocationRaw }
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
