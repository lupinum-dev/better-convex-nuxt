import type { ConvexSchemaMetaBase } from '../utils/define-convex-schema'

/**
 * Derive scoped table names from a record of table metadata.
 *
 * Tables whose metadata includes `tenant: { scoped: true }` are returned;
 * all others are excluded. This eliminates the need to maintain a separate
 * `scopedTables` list alongside your schema definitions.
 *
 * @example
 * ```ts
 * import { postTableMeta } from '../shared/schemas/post'
 *
 * const scopedTables = extractScopedTables({
 *   posts: postTableMeta,        // tenant: { scoped: true }
 *   users: { description: '…' }, // no tenant → excluded
 * })
 * // → ['posts']
 * ```
 */
export function extractScopedTables<T extends Record<string, ConvexSchemaMetaBase>>(
  tableMetas: T,
): Array<Extract<keyof T, string>> {
  return (Object.entries(tableMetas) as [Extract<keyof T, string>, ConvexSchemaMetaBase][])
    .filter(([, meta]) => meta.tenant?.scoped === true)
    .map(([name]) => name)
}
