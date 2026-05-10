import { defineArgs } from '@lupinum/trellis/args'

import { api } from '../../../convex/_generated/api'
import { tool } from '../runtime'

const harnessApi = api as any

const schema = defineArgs({
  description: 'List all notes (most recent first)',
  args: {},
})

export default tool.query({
  schema,
  call: harnessApi.notes.list,
  meta: {
    name: 'list-notes',
  },
})
