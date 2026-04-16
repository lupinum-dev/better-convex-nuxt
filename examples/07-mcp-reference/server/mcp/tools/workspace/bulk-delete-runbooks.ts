import { bulkRemove, bulkRemoveRunbooksOp, previewBulkRemove } from '~/convex/runbooks'

import { tool } from '../../runtime'

export default tool.fromOperation(bulkRemoveRunbooksOp, {
  execute: bulkRemove,
  preview: previewBulkRemove,
  capability: 'deleteWorkspaceRunbooks',
  group: 'workspace',
  tags: ['bulk', 'dangerous'],
  meta: {
    name: 'bulk-delete-runbooks',
  },
  rateLimit: { max: 5, window: '1m' },
  maxItems: { field: 'ids', limit: 10 },
  middleware: async (args, ctx, next) => {
    console.log(`[mcp] bulk-delete-runbooks count=${args.ids.length}`)
    return await next()
  },
})
