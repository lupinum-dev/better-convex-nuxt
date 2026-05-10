import { api } from '../../../convex/_generated/api'
import { searchNotes } from '../../../shared/schemas/note'
import { tool } from '../runtime'

const harnessApi = api as any
type SearchNoteResult = unknown[]

export default tool.query({
  schema: searchNotes,
  call: harnessApi.notes.search,
  meta: {
    name: 'search-notes',
  },
  mapResult: ({ result }) => {
    const notes = result as SearchNoteResult
    return { results: notes, total: notes.length }
  },
  summary: ({ args, result }) => {
    const notes = result as SearchNoteResult
    return notes.length
      ? `Found ${notes.length} note${notes.length === 1 ? '' : 's'} matching "${args.query}"`
      : `No notes found matching "${args.query}"`
  },
})
