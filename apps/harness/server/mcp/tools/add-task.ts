import { stampMcpToolSafety } from '#trellis/mcp'

import { api } from '../../../convex/_generated/api'
import { addTask } from '../../../shared/schemas/task'
import { resolveHarnessMcpAuth } from '../../support/mcp-auth-helpers'
import { tool } from '../runtime'

const harnessApi = api as any

const addTaskSafety = {
  kind: 'bounded-write',
  reason: 'Creates one task explicitly named by args.',
} as const

export default tool.mutation({
  schema: addTask,
  call: stampMcpToolSafety(harnessApi.tasks.add, addTaskSafety),
  safety: addTaskSafety,
  enabled: async (ctx) => {
    const auth = await resolveHarnessMcpAuth(ctx.event)
    return !!auth?.workspaceId
  },
  meta: {
    name: 'add-task',
  },
  respond: ({ args, result, ok }) => ok({ id: result }, `Added task "${args.title}"`),
})
