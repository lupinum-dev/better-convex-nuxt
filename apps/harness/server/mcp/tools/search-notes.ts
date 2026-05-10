import { api } from '../../../convex/_generated/api'
import { searchNotes } from '../../../shared/schemas/note'
import { tool } from '../runtime'

const harnessApi = api as any

export default tool.query({
  schema: searchNotes,
  call: harnessApi.notes.search,
  meta: {
    name: 'search-notes',
  },
  mapResult: ({ result }) => ({ results: result, total: result.length }),
  summary: ({ args, result }) =>
    result.length
      ? `Found ${result.length} note${result.length === 1 ? '' : 's'} matching "${args.query}"`
      : `No notes found matching "${args.query}"`,
})
