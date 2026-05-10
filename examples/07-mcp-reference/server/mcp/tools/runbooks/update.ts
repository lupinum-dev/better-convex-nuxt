import { stampMcpToolSafety } from '@lupinum/trellis/mcp'

import { api } from '#trellis/api'
import { runbookCreate } from '~/convex/features/runbooks/permissions'
import { updateRunbook } from '~/shared/features/runbooks/contract'

import { tool } from '../../runtime'

const updateRunbookSafety = {
  kind: 'bounded-write',
  reason: 'Updates one runbook explicitly named by args.',
} as const

export default tool.mutation({
  schema: updateRunbook,
  call: stampMcpToolSafety(api.features.runbooks.domain.update, updateRunbookSafety),
  permission: runbookCreate,
  safety: updateRunbookSafety,
  group: 'workspace',
  middleware: async (args, ctx, next) => {
    if (
      args.title === undefined &&
      args.summary === undefined &&
      args.content === undefined &&
      args.visibility === undefined &&
      args.tags === undefined
    ) {
      return ctx.error('validation', 'Provide at least one field to update.')
    }

    const existing = await ctx.query(api.features.runbooks.domain.getWorkspace, { id: args.id })
    if (!existing) {
      return ctx.error('not_found', `Runbook "${args.id}" not found.`)
    }

    return await next()
  },
  meta: {
    name: 'update-runbook',
  },
})
