import type { GenericId } from 'convex/values'

export type Id<TableName extends string = string> = GenericId<TableName>
export type DataModel = any

