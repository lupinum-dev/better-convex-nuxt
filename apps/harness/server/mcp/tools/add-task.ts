import { defineTool } from '#trellis/mcp'

import { api } from '../../../convex/_generated/api'
import { addTask } from '../../../shared/schemas/task'
import { resolveHarnessMcpAuth } from '../../support/mcp-auth-helpers'

export default defineTool({
  schema: addTask,
  name: 'add-task',
  auth: 'required',
  scoped: true,
  enabled: async (event) => {
    const auth = await resolveHarnessMcpAuth(event)
    return !!auth?.tenantId
  },
  resolveAuth: resolveHarnessMcpAuth,
  handler: async (args, ctx) => {
    const taskId = await ctx.mutation(api.tasks.add, args)
    return ctx.ok({ id: taskId }, `Added task "${args.title}"`)
  },
})
