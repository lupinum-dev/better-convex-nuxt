import { publishPageOp } from '../../../convex/components/miniCms/features/pages/operations'
import { publish, previewPublish } from '../../../convex/features/pages/domain'
import { publishPagePermission } from '../../../convex/features/pages/permissions'
import { tool } from '../../lib/mcp-runtime'

export default tool.fromOperation(publishPageOp, {
  execute: publish,
  preview: previewPublish,
  permission: publishPagePermission,
  group: 'pages',
  meta: {
    name: 'publish-page',
    description: 'Publish the selected draft page to the public site.',
  },
})
