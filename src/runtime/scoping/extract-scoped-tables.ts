import type { TableMeta } from '../utils/define-convex-schema'

export function extractScopedTables<T extends Record<string, TableMeta>>(
  tableMetas: T,
): Array<Extract<keyof T, string>> {
  return (Object.entries(tableMetas) as [Extract<keyof T, string>, TableMeta][])
    .filter(([, meta]) => meta.tenant?.scoped === true)
    .map(([name]) => name)
}
