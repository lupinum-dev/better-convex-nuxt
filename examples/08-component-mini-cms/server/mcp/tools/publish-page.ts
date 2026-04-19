import { tool } from '~/server/lib/mcp-runtime'
import {
  previewPublishPage,
  publishPage,
  publishPageOp,
} from '~/convex/components/miniCms/pages'
import { publishPagePermission } from '../../../convex/auth/permissions'

export default tool.fromOperation(publishPageOp, {
  execute: publishPage,
  preview: previewPublishPage,
  permission: publishPagePermission,
  group: 'pages',
  meta: {
    name: 'publish-page',
    description: 'Publish the selected draft page to the public site.',
  },
})
