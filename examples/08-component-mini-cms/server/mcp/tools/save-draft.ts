import { internal } from '#trellis/api'
import { tool } from '~/server/lib/mcp-runtime'
import { saveDraft } from '~/shared/schemas/page'

export default tool({
  schema: saveDraft,
  call: internal.operations.miniCmsBridge.saveDraft,
  capability: 'saveDraft',
  group: 'pages',
  meta: {
    name: 'save-draft',
    description: 'Update the draft body, title, or slug of an existing page.',
  },
})
