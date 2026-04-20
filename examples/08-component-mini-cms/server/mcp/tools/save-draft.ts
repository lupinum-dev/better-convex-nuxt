import { api } from '#trellis/api'

import { saveDraftPermission } from '../../../convex/features/pages/permissions'
import { saveDraft } from '../../../shared/features/pages/contract'
import { tool } from '../../lib/mcp-runtime'

export default tool({
  schema: saveDraft,
  call: api.features.pages.domain.save,
  permission: saveDraftPermission,
  group: 'pages',
  meta: {
    name: 'save-draft',
    description: 'Update the draft body, title, or slug of an existing page.',
  },
})
