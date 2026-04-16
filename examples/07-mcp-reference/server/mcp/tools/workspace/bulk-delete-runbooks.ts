import { api } from '#trellis/api'
import { bulkDeleteRunbooks } from '~/shared/schemas/runbook'

import { tool } from '../../runtime'

export default tool({
  schema: bulkDeleteRunbooks,
  call: api.runbooks.bulkRemove,
  preview: api.runbooks.previewBulkRemove,
  capability: 'deleteWorkspaceRunbooks',
  group: 'workspace',
  tags: ['bulk', 'dangerous'],
  meta: {
    name: 'bulk-delete-runbooks',
    destructive: true,
  },
  rateLimit: { max: 5, window: '1m' },
  maxItems: { field: 'ids', limit: 10 },
  middleware: async (args, ctx, next) => {
    console.log(`[mcp] bulk-delete-runbooks count=${args.ids.length}`)
    return await next()
  },
})
