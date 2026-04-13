import { internal } from '#trellis/api'

import { listPublishedPages } from '~/shared/schemas/page'
import { projectTool } from '~/server/lib/mcp-runtime'

export default projectTool({
  schema: listPublishedPages,
  call: internal.miniCmsBridge.listPublishedPages,
  operation: 'query',
  capability: 'listPublishedPages',
  group: 'pages',
  meta: {
    name: 'list-published-pages',
    description: 'List the public pages that anonymous users can already read.',
  },
})
