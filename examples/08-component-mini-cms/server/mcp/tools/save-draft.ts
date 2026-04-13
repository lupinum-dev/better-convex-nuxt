import { internal } from '#trellis/api'

import { saveDraft } from '~/shared/schemas/page'
import { projectTool } from '~/server/lib/mcp-runtime'

export default projectTool({
  schema: saveDraft,
  call: internal.miniCmsBridge.saveDraft,
  capability: 'saveDraft',
  group: 'pages',
  meta: {
    name: 'save-draft',
    description: 'Update the draft body, title, or slug of an existing page.',
  },
})
