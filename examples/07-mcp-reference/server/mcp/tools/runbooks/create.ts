import { stampMcpToolSafety } from '@lupinum/trellis/mcp'

import { api } from '#trellis/api'
import { runbookCreate } from '~/convex/features/runbooks/permissions'
import { createRunbook } from '~/shared/features/runbooks/contract'

import { tool } from '../../runtime'

const createRunbookSafety = {
  kind: 'bounded-write',
  reason: 'Creates one draft runbook named by args.',
} as const

export default tool.mutation({
  schema: createRunbook,
  call: stampMcpToolSafety(api.features.runbooks.domain.create, createRunbookSafety),
  permission: runbookCreate,
  safety: createRunbookSafety,
  group: 'workspace',
  maxItems: { field: 'tags', limit: 6 },
  middleware: async (args, ctx, next) => {
    if (!args.content.trim().startsWith('# ')) {
      return ctx.error('validation', 'Runbook content must start with a markdown heading.')
    }
    return await next()
  },
  meta: {
    name: 'create-runbook',
  },
})
