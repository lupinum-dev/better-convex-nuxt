import { defineTool } from '#trellis/mcp'

import { api } from '../../../convex/_generated/api'
import { addTask } from '../../../shared/schemas/task'
import { toHarnessMcpPrincipal } from '../../support/mcp-principal'

export default defineTool({
  schema: addTask,
  name: 'add-task',
  auth: 'required',
  handler: async (args, ctx) => {
    const taskId = await ctx.rawMutation(api.tasks.add, {
      ...args,
      principal: toHarnessMcpPrincipal(ctx),
    })
    return ctx.ok({ id: taskId }, `Added task "${args.title}"`)
  },
})
