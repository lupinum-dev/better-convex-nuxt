import type { ConvexSchemaMetaBase } from '../utils/define-convex-schema'

export function extractScopedTables<T extends Record<string, ConvexSchemaMetaBase>>(
  tableMetas: T,
): Array<Extract<keyof T, string>> {
  return (Object.entries(tableMetas) as [Extract<keyof T, string>, ConvexSchemaMetaBase][])
    .filter(([, meta]) => meta.tenant?.scoped === true)
    .map(([name]) => name)
}
