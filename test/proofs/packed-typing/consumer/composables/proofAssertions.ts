// §5.8 proof-1 compile-time assertions (criteria a + c), type-checked by
// `nuxi typecheck`. No runtime; these are pure type probes over the packed,
// node_modules-resident `better-convex-nuxt/auth-client` entry, with the
// generated registry (types/better-convex-nuxt-auth-client.d.ts) active.
import type { apiKeyClient } from '@better-auth/api-key/client'
import type { BetterAuthClientOptions, BetterAuthClientPlugin } from 'better-auth/client'
import type {
  BaseAuthClient,
  InferRegisteredConvexAuthClient,
} from 'better-convex-nuxt/auth-client'

// --- tiny type-assertion kit ---
type IsAny<T> = 0 extends 1 & T ? true : false
type Expect<T extends true> = T
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false

// The Phase 3 shape: `useConvexAuth().client` is the registered client or null.
declare const client: InferRegisteredConvexAuthClient | null

// -----------------------------------------------------------------------------
// (a) A registered apiKey-plugin definition makes the narrowed non-null client
//     expose apiKey.create with correct parameter/return types.
// -----------------------------------------------------------------------------
export function assertPluginClient() {
  if (!client) return

  // apiKey namespace + create method exist and are NOT `any`.
  type CreateFn = typeof client.apiKey.create
  type _createNotAny = Expect<Equal<IsAny<CreateFn>, false>>

  // create accepts Ginko's documented input (name, expiresIn, metadata) …
  const created = client.apiKey.create({
    name: 'ginko-studio-key',
    expiresIn: 60 * 60 * 24,
    metadata: { scope: 'studio' },
  })

  // … and returns the typed Better Auth result with string id + key on success.
  created.then((res) => {
    if (res.data) {
      const id: string = res.data.id
      const key: string = res.data.key
      void id
      void key
    }
  })

  // Params are typed (not any): an unknown field is rejected.
  // @ts-expect-error `notAField` is not part of apiKey.create input.
  client.apiKey.create({ name: 'x', notAField: true })
}

// -----------------------------------------------------------------------------
// (c) The definition generic preserves plugin tuples through a MUTABLE merged
//     plugins array (spread of a readonly tuple). better-auth's `plugins`
//     option is a mutable array; the merged [convexPlugin, ...consumerPlugins]
//     must remain assignable to it.
// -----------------------------------------------------------------------------
type ApiKeyPlugin = ReturnType<typeof apiKeyClient>
type ConvexPluginStandIn = BetterAuthClientPlugin
type MergedMutable = [ConvexPluginStandIn, ApiKeyPlugin]

// The merged tuple is a mutable array assignable to better-auth's plugins slot.
type _pluginsSlot = NonNullable<BetterAuthClientOptions['plugins']>
type _mergedAssignable = Expect<MergedMutable extends _pluginsSlot ? true : false>

// A readonly tuple must NOT be silently accepted where the mutable array is
// required — spreading (MutablePlugins) is the mechanism that makes it mutable.
type _readonlyRejected = Expect<
  Equal<readonly [ConvexPluginStandIn, ApiKeyPlugin] extends _pluginsSlot ? true : false, false>
>

// Sanity: the base (no-plugin) client is a strict structural subset — it does
// not carry the apiKey namespace (full negative proof lives in base-fallback/).
type _baseHasNoApiKey = Expect<Equal<'apiKey' extends keyof BaseAuthClient ? true : false, false>>
