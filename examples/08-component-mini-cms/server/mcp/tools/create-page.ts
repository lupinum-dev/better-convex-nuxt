import { internal } from '#trellis/api'
import { tool } from '~/server/lib/mcp-runtime'
import { createPage } from '~/shared/schemas/page'

import { createPagePermission } from '../../../convex/auth/permissions'

export default tool({
  schema: createPage,
  call: internal.operations.miniCmsBridge.createPage,
  permission: createPagePermission,
  group: 'pages',
  meta: {
    name: 'create-page',
    description: 'Create a new draft page in the local component CMS.',
  },
})
