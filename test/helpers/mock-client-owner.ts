import type { MockConvexClient } from './mock-convex-client'

/**
 * Build a minimal per-app client owner (vNext §5.4) for composable tests. The
 * primary backs `required`/`optional` transport; the anonymous client backs
 * `none`. Neither is replaced here — identity isolation in the composable is
 * observed through the identity-partitioned key and tag, not real replacement.
 */
export function makeMockOwner(
  primary: MockConvexClient,
  anonymous: MockConvexClient = primary,
): Record<PropertyKey, unknown> {
  return {
    handle: {
      query: primary.query,
      mutation: primary.mutation,
      action: primary.action,
      onUpdate: primary.onUpdate,
    },
    getPrimary: () => ({ client: primary, identityGeneration: 0 }),
    getAnonymous: () => anonymous,
    replacePrimary: async () => primary,
    attachAuthPort: () => {},
    connection: {
      state: { value: {} },
      addConsumer: () => () => {},
    },
    addDisposer: () => {},
    dispose: async () => {},
  }
}
