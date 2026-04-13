import { internal } from '#trellis/api'

import { listDraftPages } from '~/shared/schemas/page'
import { projectTool } from '~/server/lib/mcp-runtime'

export default projectTool({
  schema: listDraftPages,
  call: internal.miniCmsBridge.listDraftPages,
  operation: 'query',
  capability: 'listDraftPages',
  group: 'pages',
  meta: {
    name: 'list-draft-pages',
    description: 'List the draft pages visible to the demo agent.',
  },
})
