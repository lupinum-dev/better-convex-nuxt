import { previewOperationRef, transportExecuteOperationRef } from '@lupinum/trellis/functions'

import { publishPageOp } from '../../../convex/components/miniCms/features/pages/operations'
import { publish, previewPublish } from '../../../convex/features/pages/domain'
import { publishPagePermission } from '../../../convex/features/pages/permissions'
import { tool } from '../../lib/mcp-runtime'

export default tool.fromOperation(publishPageOp, {
  execute: transportExecuteOperationRef(publishPageOp, publish),
  preview: previewOperationRef(publishPageOp, previewPublish),
  confirmationMode: 'transport',
  permission: publishPagePermission,
  group: 'pages',
  meta: {
    name: 'publish-page',
    description: 'Publish the selected draft page to the public site.',
  },
})
