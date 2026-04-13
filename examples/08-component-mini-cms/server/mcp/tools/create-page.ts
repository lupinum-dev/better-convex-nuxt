import { internal } from '#trellis/api'
import { projectTool } from '~/server/lib/mcp-runtime'
import { createPage } from '~/shared/schemas/page'

export default projectTool({
  schema: createPage,
  call: internal.miniCmsBridge.createPage,
  capability: 'createPage',
  group: 'pages',
  meta: {
    name: 'create-page',
    description: 'Create a new draft page in the local component CMS.',
  },
})
