import { api } from '~/convex/_generated/api'
import { publishPageOp } from '~/convex/components/miniCms/pages'
import { tool } from '~/server/lib/mcp-runtime'

import { publishPagePermission } from '../../../convex/auth/permissions'

export default tool.fromOperation(publishPageOp, {
  execute: api.operations.miniCmsBridge.publishPage,
  preview: api.operations.miniCmsBridge.previewPublishPage,
  permission: publishPagePermission,
  group: 'pages',
  meta: {
    name: 'publish-page',
    description: 'Publish the selected draft page to the public site.',
  },
})
