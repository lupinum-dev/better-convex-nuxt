import { internal } from '#trellis/api'
import { tool } from '~/server/lib/mcp-runtime'
import { listPublishedPages } from '~/convex/domain/page.contract'

import { listPublishedPagesPermission } from '../../../convex/auth/permissions'

export default tool({
  schema: listPublishedPages,
  call: internal.operations.miniCmsBridge.listPublishedPages,
  operation: 'query',
  permission: listPublishedPagesPermission,
  group: 'pages',
  meta: {
    name: 'list-published-pages',
    description: 'List the public pages that anonymous users can already read.',
  },
})
