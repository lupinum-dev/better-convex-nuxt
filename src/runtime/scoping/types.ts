import type {
  GenericTableInfo,
  Query,
} from 'convex/server'
import type { GenericId } from 'convex/values'

export type AutocompleteString<T extends string> = T | (string & {})

export interface ScopedReader<TableName extends string = never> {
  query: (table: AutocompleteString<TableName>) => Query<GenericTableInfo>
  get: <T extends string>(id: GenericId<T>) => Promise<Record<string, unknown> | null>
}

export interface ScopedWriter<TableName extends string = never> extends ScopedReader<TableName> {
  insert: (table: AutocompleteString<TableName>, doc: Record<string, unknown>) => Promise<GenericId<string>>
  patch: (id: GenericId<string>, fields: Record<string, unknown>) => Promise<void>
  replace: (id: GenericId<string>, doc: Record<string, unknown>) => Promise<void>
  delete: (id: GenericId<string>) => Promise<void>
}
