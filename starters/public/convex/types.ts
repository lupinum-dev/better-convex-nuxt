import type { GenericMutationCtx, GenericQueryCtx } from 'convex/server'
import type { GenericId } from 'convex/values'

export type Id<TableName extends string> = GenericId<TableName>
export type QueryCtx = GenericQueryCtx<any>
export type MutationCtx = GenericMutationCtx<any>
