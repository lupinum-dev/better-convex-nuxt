import type {
  GenericDataModel,
  GenericDatabaseReader,
  GenericDatabaseWriter,
  GenericMutationCtx,
  GenericQueryCtx,
  GenericTableInfo,
  Query,
} from 'convex/server'
import type { GenericId } from 'convex/values'

import type { Actor, AnyCtx, ArgsWithServiceAuth } from '../actor/types'

export interface ScopedReader {
  query: (table: string) => Query<GenericTableInfo>
  get: <T extends string>(id: GenericId<T>) => Promise<Record<string, unknown> | null>
}

export interface ScopedWriter extends ScopedReader {
  insert: (table: string, doc: Record<string, unknown>) => Promise<GenericId<string>>
  patch: (id: GenericId<string>, fields: Record<string, unknown>) => Promise<void>
  replace: (id: GenericId<string>, doc: Record<string, unknown>) => Promise<void>
  delete: (id: GenericId<string>) => Promise<void>
}

export interface CreateScopedOptions {
  requireActor: (
    ctx: AnyCtx,
    args: ArgsWithServiceAuth,
  ) => Promise<Actor & { orgId: string }>
  tryResolveActor: (
    ctx: AnyCtx,
    args: ArgsWithServiceAuth,
  ) => Promise<Actor | null>
  orgField?: string
  scopedTables: readonly string[]
}

type ActorWithOrg = Actor & { orgId: string }

interface ScopedResultBase<TCtx, TScopedDb, TRawDb> {
  db: TScopedDb
  actor: ActorWithOrg
  raw: {
    ctx: TCtx
    db: TRawDb
  }
}

export type ScopedQueryResult = ScopedResultBase<
  GenericQueryCtx<GenericDataModel>,
  ScopedReader,
  GenericDatabaseReader<GenericDataModel>
>

export type ScopedMutationResult = ScopedResultBase<
  GenericMutationCtx<GenericDataModel>,
  ScopedWriter,
  GenericDatabaseWriter<GenericDataModel>
>

export type ScopedResult = ScopedQueryResult | ScopedMutationResult
