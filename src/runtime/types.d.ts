import type { createAuthClient } from 'better-auth/vue'
import type { ConvexClient } from 'convex/browser'

import type { ConvexAuthEngine } from './auth/client-engine'
import type { ConvexAuthConfigInput } from './utils/auth-config'
import type { ConvexAuthPageMeta } from './utils/auth-route-protection'
import type { LogLevel } from './utils/logger'

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
  auth?: ConvexAuthConfigInput
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
    subscribe?: boolean
    auth?: 'auto' | 'none'
    waitTimeoutMs?: number
  }
  /** Upload defaults */
  upload?: {
    maxConcurrent?: number
  }
  /** Auth proxy body-size defaults */
  authProxy?: {
    maxRequestBodyBytes?: number
    maxResponseBodyBytes?: number
  }
  /** Optional debug channels for high-verbosity traces */
  debug?: {
    authFlow?: boolean
    clientAuthFlow?: boolean
    serverAuthFlow?: boolean
  }
}

declare module '#app' {
  interface NuxtApp {
    $convex?: ConvexClient
    $auth?: AuthClient
    $convexAuthEngine?: ConvexAuthEngine
    /** Internal dedupe state for unauthorized query/action/mutation recovery */
    _bcnUnauthorizedRecoveryState?: {
      activeRecovery: Promise<void> | null
      lastRedirectKey: string | null
      lastRedirectAt: number
    }
    /** Internal in-flight promise for useConvexAuth().refreshAuth() dedupe */
    _convexRefreshAuthPromise?: Promise<void> | null
  }
  interface RuntimeNuxtHooks {
    'better-convex:auth:refresh': () => void | Promise<void>
  }
  interface PageMeta {
    skipConvexAuth?: boolean
    convexAuth?: ConvexAuthPageMeta
  }
}

declare module 'vue' {
  interface ComponentCustomProperties {
    $convex?: ConvexClient
    $auth?: AuthClient
  }
}

export {}
