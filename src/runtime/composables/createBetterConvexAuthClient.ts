import { convexClient } from '@convex-dev/better-auth/client/plugins'
import type { BetterAuthClientOptions, BetterAuthClientPlugin } from 'better-auth/client'
import { createAuthClient } from 'better-auth/vue'
import type { VueAuthClient } from 'better-auth/vue'

import { useRuntimeConfig } from '#imports'

import { normalizeAuthRoute } from '../utils/convex-config'

type ConvexBetterAuthClientPlugin = ReturnType<typeof convexClient>
type BetterConvexClientPlugins = readonly BetterAuthClientPlugin[]
type MutablePlugins<Plugins extends BetterConvexClientPlugins> = {
  -readonly [Index in keyof Plugins]: Plugins[Index]
}

export type BetterConvexAuthClientOptions<Plugins extends BetterConvexClientPlugins = []> = Omit<
  BetterAuthClientOptions,
  'baseURL' | 'plugins'
> & {
  /**
   * Absolute Better Auth base URL. Defaults to the current origin plus
   * `runtimeConfig.public.convex.authRoute`.
   */
  baseURL?: string
  /**
   * Additional Better Auth client plugins. `convexClient()` is prepended
   * automatically so Convex token sync remains intact.
   */
  plugins?: Plugins
}

export type BetterConvexAuthClientPluginList<Plugins extends BetterConvexClientPlugins> = [
  ConvexBetterAuthClientPlugin,
  ...MutablePlugins<Plugins>,
]

export type BetterConvexAuthClientResolvedOptions<Plugins extends BetterConvexClientPlugins> = Omit<
  BetterAuthClientOptions,
  'baseURL' | 'plugins'
> & {
  baseURL: string
  plugins: BetterConvexAuthClientPluginList<Plugins>
}

export type BetterConvexAuthClient<Plugins extends BetterConvexClientPlugins> = VueAuthClient<
  BetterConvexAuthClientResolvedOptions<Plugins>
>

export function resolveBetterConvexAuthBaseURL(baseURL?: string): string {
  if (baseURL) return baseURL

  if (typeof window === 'undefined') {
    throw new TypeError(
      '[createBetterConvexAuthClient] baseURL is required when creating a Better Auth client outside the browser.',
    )
  }

  const config = useRuntimeConfig()
  const publicConvex = config.public?.convex as { authRoute?: unknown } | undefined
  const authRoute = normalizeAuthRoute(
    typeof publicConvex?.authRoute === 'string' ? publicConvex.authRoute : undefined,
  )
  return `${window.location.origin}${authRoute}`
}

/**
 * Create a typed Better Auth Vue client for plugin-specific APIs while preserving
 * better-convex-nuxt's Convex token synchronization.
 *
 * This helper does not own auth state. It only builds a Better Auth client with
 * the same Nuxt auth proxy base URL and prepends `convexClient()`.
 */
export function createBetterConvexAuthClient<const Plugins extends BetterConvexClientPlugins = []>(
  options: BetterConvexAuthClientOptions<Plugins> = {},
): BetterConvexAuthClient<Plugins> {
  const { baseURL, plugins, fetchOptions, ...rest } = options
  const resolvedPlugins = [
    convexClient(),
    ...((plugins ?? []) as Plugins),
  ] as BetterConvexAuthClientPluginList<Plugins>

  const clientOptions: BetterConvexAuthClientResolvedOptions<Plugins> = {
    ...rest,
    baseURL: resolveBetterConvexAuthBaseURL(baseURL),
    plugins: resolvedPlugins,
    fetchOptions: {
      credentials: 'include' as const,
      ...fetchOptions,
    },
  }

  return createAuthClient(clientOptions)
}
