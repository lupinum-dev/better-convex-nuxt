import type {
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
} from 'convex/server'
import type { GenericId } from 'convex/values'

// ============================================================================
// Actor — the resolved identity
// ============================================================================

export interface Actor {
  userId: string
  role: string
  orgId?: string
  _id?: GenericId<string>
}

// ============================================================================
// ActorConfig — how to resolve actors in your app
// ============================================================================

export type AnyCtx =
  | GenericQueryCtx<GenericDataModel>
  | GenericMutationCtx<GenericDataModel>

export interface ActorConfig<TCtx = AnyCtx> {
  /**
   * Resolve an actor from ctx.auth (browser path).
   * Return null if not authenticated.
   */
  resolveFromAuth: (ctx: TCtx) => Promise<Actor | null>

  /**
   * Service key validation for server-to-server calls.
   *
   * - `string` → environment variable name (compared with `process.env[name]`)
   * - `function` → custom validator, receives `(key, ctx)` for DB-backed validation
   * - `undefined` → service auth disabled
   */
  serviceKey?: string | ((key: string, ctx: TCtx) => boolean | Promise<boolean>)
}

// ============================================================================
// Service auth args shape (for type narrowing in resolve-actor)
// ============================================================================

export interface ServiceActorData {
  userId: string
  role: string
  orgId?: string
}

export interface ArgsWithServiceAuth {
  _serviceKey?: string
  _serviceActor?: ServiceActorData
  [key: string]: unknown
}
