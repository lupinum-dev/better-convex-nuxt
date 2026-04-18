import { internal } from '#trellis/api'
import { tool } from '~/server/lib/mcp-runtime'
import { createPage } from '~/shared/schemas/page'

export default tool({
  schema: createPage,
  call: internal.operations.miniCmsBridge.createPage,
  capability: 'createPage',
  group: 'pages',
  meta: {
    name: 'create-page',
    description: 'Create a new draft page in the local component CMS.',
  },
})
