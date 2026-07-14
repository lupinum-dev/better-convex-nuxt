import { useNuxtApp } from '#imports'

import type { ConvexClientHandle } from '../client/client-owner'
import { readConvexRuntimeContext } from '../runtime-context'

export type { ConvexClientHandle } from '../client/client-owner'

/**
 * Access the stable, replacement-safe Convex client handle (vNext §5.4).
 *
 * `useConvex()` never returns the raw `ConvexClient`. The per-Nuxt-app client
 * owner replaces the underlying primary client on every stable identity-key
 * change (sign-in, sign-out/revocation, direct user replacement); a captured raw
 * client would be a closed, stale instance after any such transition. The handle
 * exposes only the four replacement-safe operations — `query`, `mutation`,
 * `action`, and `onUpdate` — with stable function identity:
 *
 * - `query`/`mutation`/`action` dispatch to the current primary; an invocation
 *   that crosses an identity generation rejects with a `ConvexCallError`
 *   (`kind: 'authentication'`, `code: 'IDENTITY_CHANGED'`) and never returns the
 *   old result.
 * - `onUpdate` returns a stable unsubscribe whose subscription the owner rebinds
 *   A→B; it is retained for the non-Nuxt Ginko Studio bridge.
 *
 * Connection observation is NOT on the handle — use `useConvexConnectionState()`.
 *
 * Throws when no client owner exists (SSR, or a build with no Convex URL): this
 * composable is client-only.
 *
 * @example
 * ```vue
 * <script setup>
 * import { api } from '#convex/api'
 *
 * const convex = useConvex()
 * onMounted(async () => {
 *   const result = await convex.query(api.tasks.list, {})
 * })
 * </script>
 * ```
 */
export function useConvex(): ConvexClientHandle {
  const nuxtApp = useNuxtApp()
  const owner = readConvexRuntimeContext(nuxtApp)?.owner

  if (!owner) {
    throw new Error(
      '[useConvex] Convex client handle is unavailable. This composable is client-only and requires a configured Convex URL.',
    )
  }

  return owner.handle
}
