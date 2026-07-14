import type { Ref } from 'vue'

import { useState } from '#imports'

import { ANONYMOUS_IDENTITY, LOADING_IDENTITY, type AuthIdentity } from '../auth/auth-identity'

/** The single SSR-hydrated identity value used by every runtime auth reader. */
export function useConvexIdentityState(): Ref<AuthIdentity> {
  return useState<AuthIdentity>('convex:identity', () =>
    import.meta.client ? LOADING_IDENTITY : ANONYMOUS_IDENTITY,
  )
}
