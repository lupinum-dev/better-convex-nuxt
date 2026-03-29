import { defineConvexSchema } from 'better-convex-nuxt/schema'
import { withSummary } from 'better-convex-nuxt/mcp'

import { api } from '../../../convex/_generated/api'
import { addTaskArgs, addTaskMeta } from '../../../shared/schemas/task'
import { defineConvexTool } from '../utils/tools'

const schema = defineConvexSchema(addTaskArgs, addTaskMeta)

export default defineConvexTool({
  schema,
  name: 'add-task',
  auth: 'required',
  handler: async (args, _extra, ctx) => {
    const taskId = await ctx.mutation(api.tasks.add, args)
    return withSummary({ id: taskId }, `Added task "${args.title}"`)
  },
})
