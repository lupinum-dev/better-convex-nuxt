import { stampMcpToolSafety } from '@lupinum/trellis/mcp'

import { api } from '#trellis/api'

import { createPagePermission } from '../../../convex/features/pages/permissions'
import { createPage } from '../../../shared/features/pages/contract'
import { tool } from '../../lib/mcp-runtime'

const createPageSafety = {
  kind: 'bounded-write',
  reason: 'Creates one draft page named by args.',
} as const

export default tool.mutation({
  schema: createPage,
  call: stampMcpToolSafety(api.features.pages.domain.create, createPageSafety),
  permission: createPagePermission,
  safety: createPageSafety,
  group: 'pages',
  meta: {
    name: 'create-page',
    description: 'Create a new draft page in the local component CMS.',
  },
})
