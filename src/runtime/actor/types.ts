import type {
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
} from 'convex/server'
import type { GenericId } from 'convex/values'

// ============================================================================
// Actor — the resolved identity
// ============================================================================

export interface Actor<TRole extends string = string> {
  userId: string
  role: TRole
  orgId?: string
  _id?: GenericId<string>
}

// ============================================================================
// ActorConfig — how to resolve actors in your app
// ============================================================================

export type AnyCtx =
  | GenericQueryCtx<GenericDataModel>
  | GenericMutationCtx<GenericDataModel>

export interface ActorConfig<TCtx = AnyCtx, TRole extends string = string> {
  /**
   * Resolve an actor from ctx.auth (browser path).
   * Return null if not authenticated.
   */
  resolveFromAuth: (ctx: TCtx) => Promise<Actor<TRole> | null>

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

export interface ServiceActorData<TRole extends string = string> {
  userId: string
  role: TRole
  orgId?: string
}

export interface ArgsWithServiceAuth<TRole extends string = string> {
  _serviceKey?: string
  _serviceActor?: ServiceActorData<TRole>
  [key: string]: unknown
}
