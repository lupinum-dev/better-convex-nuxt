import { stampMcpToolSafety } from '@lupinum/trellis/mcp'

import { api } from '#trellis/api'

import { saveDraftPermission } from '../../../convex/features/pages/permissions'
import { saveDraft } from '../../../shared/features/pages/contract'
import { tool } from '../../lib/mcp-runtime'

const saveDraftSafety = {
  kind: 'bounded-write',
  reason: 'Updates one draft page explicitly named by args.',
} as const

export default tool.mutation({
  schema: saveDraft,
  call: stampMcpToolSafety(api.features.pages.domain.save, saveDraftSafety),
  permission: saveDraftPermission,
  safety: saveDraftSafety,
  group: 'pages',
  meta: {
    name: 'save-draft',
    description: 'Update the draft body, title, or slug of an existing page.',
  },
})
