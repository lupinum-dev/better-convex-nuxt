import { internal } from '#trellis/api'
import { tool } from '~/server/lib/mcp-runtime'
import { listDraftPages } from '~/shared/schemas/page'

import { listDraftPagesPermission } from '../../../convex/auth/permissions'

export default tool({
  schema: listDraftPages,
  call: internal.operations.miniCmsBridge.listDraftPages,
  operation: 'query',
  permission: listDraftPagesPermission,
  group: 'pages',
  meta: {
    name: 'list-draft-pages',
    description: 'List the draft pages visible to the authenticated MCP caller.',
  },
})
