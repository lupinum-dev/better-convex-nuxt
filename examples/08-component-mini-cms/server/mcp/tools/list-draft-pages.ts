import { api } from '#trellis/api'

import { listDraftPagesPermission } from '../../../convex/features/pages/permissions'
import { listDraftPages } from '../../../shared/features/pages/contract'
import { tool } from '../../lib/mcp-runtime'

export default tool.query({
  schema: listDraftPages,
  call: api.features.pages.domain.listDraft,
  permission: listDraftPagesPermission,
  group: 'pages',
  meta: {
    name: 'list-draft-pages',
    description: 'List the draft pages visible to the authenticated MCP caller.',
  },
})
