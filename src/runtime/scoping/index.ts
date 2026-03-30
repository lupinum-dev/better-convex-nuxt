export { extractScopedTables } from './extract-scoped-tables'
export { createScopedReader, createScopedWriter, resolveScopedTableForId } from './scoped-db'
export { ScopingError, type ScopingErrorCode } from './errors'
export type {
  AutocompleteString,
  ScopedReader,
  ScopedWriter,
} from './types'
