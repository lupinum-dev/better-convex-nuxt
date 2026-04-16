import { tool } from '~/server/lib/mcp-runtime'
import {
  previewPublishPage,
  publishPage,
  publishPageOp,
} from '~/convex/components/miniCms/pages'

export default tool.fromOperation(publishPageOp, {
  execute: publishPage,
  preview: previewPublishPage,
  capability: 'publishPage',
  group: 'pages',
  meta: {
    name: 'publish-page',
    description: 'Publish the selected draft page to the public site.',
  },
})
