import { api } from '#trellis/api'

import { listPublishedPagesPermission } from '../../../convex/features/pages/permissions'
import { listPublishedPages } from '../../../shared/features/pages/contract'
import { tool } from '../../lib/mcp-runtime'

export default tool({
  schema: listPublishedPages,
  call: api.features.pages.domain.listPublished,
  operation: 'query',
  permission: listPublishedPagesPermission,
  group: 'pages',
  meta: {
    name: 'list-published-pages',
    description: 'List the public pages that anonymous users can already read.',
  },
})
