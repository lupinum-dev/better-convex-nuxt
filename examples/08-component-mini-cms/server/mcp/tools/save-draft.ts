import { internal } from '#trellis/api'
import { tool } from '~/server/lib/mcp-runtime'
import { saveDraft } from '~/shared/schemas/page'

import { saveDraftPermission } from '../../../convex/auth/permissions'

export default tool({
  schema: saveDraft,
  call: internal.operations.miniCmsBridge.saveDraft,
  permission: saveDraftPermission,
  group: 'pages',
  meta: {
    name: 'save-draft',
    description: 'Update the draft body, title, or slug of an existing page.',
  },
})
