import { defineTool } from '#convex/mcp'

import { api } from '../../../convex/_generated/api'
import { addTask } from '../../../shared/schemas/task'

export default defineTool({
  schema: addTask,
  name: 'add-task',
  auth: 'required',
  handler: async (args, _extra, ctx) => {
    const taskId = await ctx.mutation(api.tasks.add, args)
    return ctx.ok({ id: taskId }, `Added task "${args.title}"`)
  },
})
