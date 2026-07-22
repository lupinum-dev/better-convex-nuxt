import type { createAuthClient } from 'better-auth/vue'
import type { ConvexClient } from 'convex/browser'
import type { ComputedRef, Ref } from 'vue'

import type { ClientIdentityPort } from '../client-core/identity-port'
import type { ConvexCallError } from '../errors'
import type { ConvexAuthStatus } from '../utils/auth-status'
import type { ConvexUser } from '../utils/types'
import type { AuthIdentity } from './auth-identity'
import type { ConvexTokenSource } from './token-fetcher'

/** Better Auth client augmented with the prepended Convex token plugin. */
export type AuthClientWithConvex = ReturnType<typeof createAuthClient> & ConvexTokenSource

/** The mutable useState-backed public state the coordinator writes (SSR-seeded). */
export interface ConvexAuthCoordinatorState {
  /** Canonical identity; token and user are readonly derived projections. */
  identity: Ref<AuthIdentity>
  /** `true` while initial resolution is unsettled — the `loading` signal. */
  pending: Ref<boolean>
  authError: Ref<string | null>
}

/** Public surface of the per-Nuxt-app authentication coordinator. */
export interface ConvexAuthCoordinator {
  readonly port: ClientIdentityPort
  readonly status: ComputedRef<ConvexAuthStatus>
  readonly isPending: ComputedRef<boolean>
  readonly isAuthenticated: ComputedRef<boolean>
  readonly token: Readonly<Ref<string | null>>
  readonly user: Readonly<Ref<ConvexUser | null>>
  readonly error: ComputedRef<ConvexCallError | null>
  wrapNamespace<T extends object>(namespace: T): T
  readonly integratedSignIn: object | null
  readonly integratedSignUp: object | null
  ready(options?: { timeoutMs?: number }): Promise<ConvexAuthStatus>
  refresh(): Promise<void>
  reconcileSession(sessionToken: string | null, errorMessage?: string | null): Promise<void>
  signOut(): Promise<unknown>
  attachPrimary(client: ConvexClient): void
  dispose(): void
}
