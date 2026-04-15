import { internal } from '#trellis/api'
import { projectTool } from '~/server/lib/mcp-runtime'
import { listDraftPages } from '~/shared/schemas/page'

export default projectTool({
  schema: listDraftPages,
  call: internal.miniCmsBridge.listDraftPages,
  operation: 'query',
  capability: 'listDraftPages',
  group: 'pages',
  meta: {
    name: 'list-draft-pages',
    description: 'List the draft pages visible to the authenticated MCP caller.',
  },
})
