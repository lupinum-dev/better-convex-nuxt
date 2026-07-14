// Framework-free typed auth-client definition entry (vNext §4.3 / §8).
//
// Published as `better-convex-nuxt/auth-client`. This subpath contains ONLY the
// definition identity function and its types. It must not import Nuxt, Vue,
// `#imports`, browser globals, or server globals; the only imports are
// type-only Better Auth / Convex-plugin types, which carry no runtime coupling
// (enforced by the `auth-client-no-runtime-deps` boundary rule and the
// `./auth-client` packed-entry purity guard).
//
// The typing mechanism here is proven from the real packed entry by
// `test/fixtures/auth-client-typing`: `InferRegisteredConvexAuthClient` feeds
// the resolved options to `VueAuthClient<Options>` WITHOUT re-intersecting the full
// `BetterAuthClientOptions`. That broad type carries an optional
// `plugins?: BetterAuthClientPlugin[]`; intersecting it collapses the resolved
// plugin tuple and silently degrades plugin-method inference to `any`. Base
// options are carried only via `Omit<BetterAuthClientOptions, ...>`. Base and
// registered client types are inferred from `better-auth/vue` (the runtime
// instantiation entry), not `better-auth/client`, so session/plugin shapes
// cannot drift.

import type { convexClient } from '@convex-dev/better-auth/client/plugins'
import type { BetterAuthClientOptions, BetterAuthClientPlugin } from 'better-auth/client'
import type { VueAuthClient } from 'better-auth/vue'

/** Additional Better Auth client plugins supplied by a consumer definition. */
export type AuthClientPlugins = readonly BetterAuthClientPlugin[]

/**
 * Consumer-facing options for a Convex auth-client definition (vNext §8).
 *
 * The consumer supplies additional client plugins only. `baseURL`/`basePath`
 * (the module owns fixed same-origin `/api/auth`), `plugins` (the library
 * prepends exactly one Convex client plugin), and `fetchOptions` (the library
 * owns credentials and request transport) are all removed from the surface.
 */
export type ConvexAuthClientDefinitionOptions<Plugins extends AuthClientPlugins> = Omit<
  BetterAuthClientOptions,
  'baseURL' | 'basePath' | 'plugins' | 'fetchOptions'
> & {
  plugins?: Plugins
}

/** A frozen, framework-free description of the consumer's client (no instance). */
export interface ConvexAuthClientDefinition<Plugins extends AuthClientPlugins> {
  readonly options: ConvexAuthClientDefinitionOptions<Plugins>
}

/**
 * Capture the typed shape of a Convex Better Auth client without instantiating
 * one. The `const` plugins generic preserves the tuple so plugin-method
 * inference survives into `InferRegisteredConvexAuthClient`.
 *
 * @example
 * ```ts
 * // app/convex-auth.ts — import your plugin clients (organizationClient,
 * // apiKeyClient) and defineConvexAuthClient, then:
 * export default defineConvexAuthClient({
 *   plugins: [organizationClient(), apiKeyClient()],
 * })
 * ```
 */
export function defineConvexAuthClient<const Plugins extends AuthClientPlugins = []>(
  options: ConvexAuthClientDefinitionOptions<Plugins> = {},
): ConvexAuthClientDefinition<Plugins> {
  return Object.freeze({ options: Object.freeze(options) })
}

/**
 * Augmentable registry (vNext §8). The module-generated type template (produced
 * by `src/module.ts` via Nuxt Kit `addTypeTemplate`) adds a `definition` member
 * whose type is `typeof` the resolved consumer definition:
 *
 * ```ts
 * declare module 'better-convex-nuxt/auth-client' {
 *   interface ConvexAuthClientRegistry {
 *     definition: typeof definition
 *   }
 * }
 * ```
 *
 * Augmenting this exact module (where the interface is declared) is required:
 * `InferRegisteredConvexAuthClient` below reads this interface, and a
 * cross-module re-export augmentation would not merge into it. The packed
 * auth-client typing fixture covers this boundary.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- intentionally empty; the generated type template augments it with `definition`.
export interface ConvexAuthClientRegistry {}

/** The single Convex client plugin the library always prepends. */
type ConvexPlugin = ReturnType<typeof convexClient>

/**
 * Better Auth's `plugins` option is a MUTABLE array; a definition holds a
 * readonly tuple, so strip `readonly` when spreading into resolved options.
 */
type MutablePlugins<P extends readonly unknown[]> = { -readonly [I in keyof P]: P[I] }

/** Extract the plugins tuple from a registered definition VALUE (never `ReturnType<typeof factory>`). */
type PluginsOf<D> = D extends ConvexAuthClientDefinition<infer P> ? P : []

/**
 * The options actually handed to `createAuthClient`: base options via `Omit`
 * plus the module-owned `baseURL` and the `[convexPlugin, ...consumerPlugins]`
 * tuple. The full `BetterAuthClientOptions` is deliberately NOT re-intersected.
 */
type ResolvedOptions<Plugins extends AuthClientPlugins> = Omit<
  BetterAuthClientOptions,
  'baseURL' | 'plugins'
> & {
  baseURL: string
  plugins: [ConvexPlugin, ...MutablePlugins<Plugins>]
}

/** The inferred client type for the library-owned options with no consumer plugins. */
export type BaseAuthClient = VueAuthClient<ResolvedOptions<[]>>

/**
 * The `useConvexAuth().client` type. Exposes the registered definition's plugin
 * methods when a definition is registered; falls back to the base Better Auth
 * client type otherwise.
 */
export type InferRegisteredConvexAuthClient = ConvexAuthClientRegistry extends {
  definition: infer D
}
  ? VueAuthClient<ResolvedOptions<PluginsOf<D>>>
  : BaseAuthClient
