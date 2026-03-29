import type { createAuthClient } from 'better-auth/vue'
import type { ConvexClient } from 'convex/browser'
import type { RouteLocationRaw } from 'vue-router'

import type { ConvexAuthConfigInput } from './utils/auth-config'
import type { LogLevel } from './utils/logger'
import type {
  ConvexAuthChangedPayload,
  ConvexCallErrorPayload,
  ConvexCallSuccessPayload,
  ConvexConnectionChangedPayload,
  ConvexUnauthorizedPayload,
} from './utils/types'

type AuthClient = ReturnType<typeof createAuthClient>

/**
 * Convex module public runtime config
 */
export interface ConvexPublicRuntimeConfig {
  /** Convex deployment URL (WebSocket) */
  url?: string
  /** Convex site URL (HTTP/Auth) */
  siteUrl?: string
  /** Auth integration config (route, trusted origins, cache, proxy, skip routes) */
  auth?: ConvexAuthConfigInput
  /** Global query defaults */
  query?: {
    server?: boolean
    subscribe?: boolean
  }
  /** Upload defaults */
  upload?: {
    maxConcurrent?: number
  }
  /** Whether permissions helper mode is enabled */
  permissions?: boolean
  /** Logging level */
  logging?: LogLevel
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
    $convex?: ConvexClient
    $auth?: AuthClient
    /** Internal dedupe state for unauthorized query/action/mutation recovery */
    _bcnUnauthorizedRecoveryState?: {
      activeRecovery: Promise<void> | null
      lastRedirectKey: string | null
      lastRedirectAt: number
    }
  }
  interface RuntimeNuxtHooks {
    'better-convex:auth:refresh': () => void | Promise<void>
    'better-convex:auth:invalidate': () => void | Promise<void>
    'convex:unauthorized': (payload: ConvexUnauthorizedPayload) => void | Promise<void>
    'convex:mutation:success': (payload: ConvexCallSuccessPayload<'mutation'>) => void | Promise<void>
    'convex:mutation:error': (payload: ConvexCallErrorPayload<'mutation'>) => void | Promise<void>
    'convex:action:success': (payload: ConvexCallSuccessPayload<'action'>) => void | Promise<void>
    'convex:action:error': (payload: ConvexCallErrorPayload<'action'>) => void | Promise<void>
    'convex:connection:changed': (payload: ConvexConnectionChangedPayload) => void | Promise<void>
    'convex:auth:changed': (payload: ConvexAuthChangedPayload) => void | Promise<void>
  }
  interface PageMeta {
    skipConvexAuth?: boolean
    convexAuth?: boolean | { redirectTo?: RouteLocationRaw }
  }
}

declare module 'vue' {
  interface ComponentCustomProperties {
    $convex?: ConvexClient
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
