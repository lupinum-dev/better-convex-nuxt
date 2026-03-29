import type {
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
} from 'convex/server'

import { createScopedReader, createScopedWriter } from './scoped-db'
import type {
  CreateScopedOptions,
  ScopedMutationResult,
  ScopedQueryResult,
  ScopedResult,
} from './types'
import type { Actor, ArgsWithServiceAuth } from '../actor/types'

type ActorWithOrg = Actor & { orgId: string }

function isMutationCtx(
  ctx: GenericQueryCtx<GenericDataModel> | GenericMutationCtx<GenericDataModel>,
): ctx is GenericMutationCtx<GenericDataModel> {
  return typeof (ctx.db as unknown as Record<string, unknown>).insert === 'function'
}

export interface ScopedFn {
  (
    ctx: GenericMutationCtx<GenericDataModel>,
    args: ArgsWithServiceAuth,
  ): Promise<ScopedMutationResult>
  (
    ctx: GenericQueryCtx<GenericDataModel>,
    args: ArgsWithServiceAuth,
  ): Promise<ScopedQueryResult>

  try: {
    (
      ctx: GenericMutationCtx<GenericDataModel>,
      args: ArgsWithServiceAuth,
    ): Promise<ScopedMutationResult | null>
    (
      ctx: GenericQueryCtx<GenericDataModel>,
      args: ArgsWithServiceAuth,
    ): Promise<ScopedQueryResult | null>
  }
}

export function createScoped(config: CreateScopedOptions): ScopedFn {
  const orgField = config.orgField ?? 'organizationId'
  const scopedTables = [...config.scopedTables]

  function buildResult(
    ctx: GenericQueryCtx<GenericDataModel> | GenericMutationCtx<GenericDataModel>,
    actor: ActorWithOrg,
  ): ScopedResult {
    if (isMutationCtx(ctx)) {
      return {
        db: createScopedWriter(ctx.db, actor.orgId, orgField, scopedTables),
        actor,
        raw: { ctx, db: ctx.db },
      }
    }

    return {
      db: createScopedReader(ctx.db, actor.orgId, orgField, scopedTables),
      actor,
      raw: { ctx, db: ctx.db },
    }
  }

  async function scoped(
    ctx: GenericQueryCtx<GenericDataModel> | GenericMutationCtx<GenericDataModel>,
    args: ArgsWithServiceAuth,
  ): Promise<ScopedResult> {
    const actor = await config.requireActor(ctx, args)
    return buildResult(ctx, actor)
  }

  scoped.try = async function scopedTry(
    ctx: GenericQueryCtx<GenericDataModel> | GenericMutationCtx<GenericDataModel>,
    args: ArgsWithServiceAuth,
  ): Promise<ScopedResult | null> {
    const actor = await config.tryResolveActor(ctx, args)
    if (!actor?.orgId) return null
    return buildResult(ctx, actor as ActorWithOrg)
  }

  return scoped as ScopedFn
}
