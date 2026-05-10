import { stampMcpToolSafety } from '#trellis/mcp'

import { api } from '../../../convex/_generated/api'
import { createNote } from '../../../shared/schemas/note'
import { tool } from '../runtime'

const harnessApi = api as any

const createNoteSafety = {
  kind: 'bounded-write',
  reason: 'Creates one note explicitly named by args.',
} as const

export default tool.mutation({
  schema: createNote,
  call: stampMcpToolSafety(harnessApi.notes.add, createNoteSafety),
  safety: createNoteSafety,
  meta: {
    name: 'create-note',
  },
  respond: ({ args, result, ok }) => ok({ id: result }, `Created note "${args.title}"`),
})
