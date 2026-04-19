import { api } from '~/convex/_generated/api'
import { runbookBulkDelete } from '~/convex/auth/permissions'
import { bulkRemoveRunbooksOp } from '~/convex/operations/runbooks'

import { tool } from '../../runtime'

export default tool.fromOperation(bulkRemoveRunbooksOp, {
  execute: api.domain.runbooks.bulkRemove,
  preview: api.operations.runbooks.previewBulkRemove,
  permission: runbookBulkDelete,
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
