import type {
  GenericDataModel,
  GenericDatabaseReader,
  GenericDatabaseWriter,
  GenericMutationCtx,
  GenericQueryCtx,
} from 'convex/server'

import { createScopedReader, createScopedWriter } from '../tenant/scoped-db'
import type { ScopedReader, ScopedWriter } from '../tenant/types'
import { createRequireActor, createTryResolveActor } from './resolve-actor'
import type { Actor, ActorConfig, ArgsWithServiceAuth } from './types'

// ============================================================================
// Types
// ============================================================================

export interface ScopedConfig {
  actor: ActorConfig
  orgField?: string
  scopedTables: readonly string[]
}

type ActorWithOrg = Actor & { orgId: string }

interface ScopedResultBase<TDb> {
  db: TDb
  actor: ActorWithOrg
  raw: {
    db: GenericDatabaseReader<GenericDataModel> | GenericDatabaseWriter<GenericDataModel>
  }
}

export type ScopedQueryResult = ScopedResultBase<ScopedReader>
export type ScopedMutationResult = ScopedResultBase<ScopedWriter>
export type ScopedResult = ScopedQueryResult | ScopedMutationResult

// ============================================================================
// Mutation context detection
// ============================================================================

function isMutationCtx(
  ctx: GenericQueryCtx<GenericDataModel> | GenericMutationCtx<GenericDataModel>,
): ctx is GenericMutationCtx<GenericDataModel> {
  return typeof (ctx.db as unknown as Record<string, unknown>).insert === 'function'
}

// ============================================================================
// createScoped — factory that returns scoped() and scoped.try()
// ============================================================================

export interface ScopedFn {
  (
    ctx: GenericQueryCtx<GenericDataModel>,
    args: ArgsWithServiceAuth,
  ): Promise<ScopedQueryResult>
  (
    ctx: GenericMutationCtx<GenericDataModel>,
    args: ArgsWithServiceAuth,
  ): Promise<ScopedMutationResult>

  try: {
    (
      ctx: GenericQueryCtx<GenericDataModel>,
      args: ArgsWithServiceAuth,
    ): Promise<ScopedQueryResult | null>
    (
      ctx: GenericMutationCtx<GenericDataModel>,
      args: ArgsWithServiceAuth,
    ): Promise<ScopedMutationResult | null>
  }
}

export function createScoped(config: ScopedConfig): ScopedFn {
  const orgField = config.orgField ?? 'organizationId'
  const scopedTables = [...config.scopedTables]
  const requireActor = createRequireActor(config.actor)
  const tryResolveActor = createTryResolveActor(config.actor)

  function buildResult(
    ctx: GenericQueryCtx<GenericDataModel> | GenericMutationCtx<GenericDataModel>,
    actor: ActorWithOrg,
  ): ScopedResult {
    if (isMutationCtx(ctx)) {
      return {
        db: createScopedWriter(ctx.db, actor.orgId, orgField, scopedTables),
        actor,
        raw: { db: ctx.db },
      }
    }
    return {
      db: createScopedReader(ctx.db, actor.orgId, orgField, scopedTables),
      actor,
      raw: { db: ctx.db },
    }
  }

  // scoped(ctx, args) — throws if no auth or no org
  async function scoped(
    ctx: GenericQueryCtx<GenericDataModel> | GenericMutationCtx<GenericDataModel>,
    args: ArgsWithServiceAuth,
  ): Promise<ScopedResult> {
    const actor = await requireActor(ctx, args)
    return buildResult(ctx, actor)
  }

  // scoped.try(ctx, args) — returns null if no auth or no org
  scoped.try = async function scopedTry(
    ctx: GenericQueryCtx<GenericDataModel> | GenericMutationCtx<GenericDataModel>,
    args: ArgsWithServiceAuth,
  ): Promise<ScopedResult | null> {
    const actor = await tryResolveActor(ctx, args)
    if (!actor?.orgId) return null
    return buildResult(ctx, actor as ActorWithOrg)
  }

  return scoped as ScopedFn
}
