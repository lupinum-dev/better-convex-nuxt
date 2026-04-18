import { bulkRemove } from '~/convex/domain/runbooks'
import { bulkRemoveRunbooksOp, previewBulkRemove } from '~/convex/operations/runbooks'

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
  maxItems: { field: 'ids' as never, limit: 10 },
  middleware: async (args: any, _ctx, next) => {
    console.log(`[mcp] bulk-delete-runbooks count=${args.ids.length}`)
    return await next()
  },
})
