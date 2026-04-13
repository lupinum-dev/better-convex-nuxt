import { internal } from '#trellis/api'

import { publishPage } from '~/shared/schemas/page'
import { projectTool } from '~/server/lib/mcp-runtime'

export default projectTool({
  schema: publishPage,
  call: internal.miniCmsBridge.publishPage,
  preview: internal.miniCmsBridge.previewPublishPage,
  operation: 'mutation',
  previewOperation: 'query',
  capability: 'publishPage',
  group: 'pages',
  meta: {
    name: 'publish-page',
    description: 'Publish the selected draft page to the public site.',
    destructive: true,
  },
})
