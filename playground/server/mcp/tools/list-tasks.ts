import { defineTool } from '#convex/mcp'

import { api } from '../../../convex/_generated/api'
import { listTasks } from '../../../shared/schemas/task'

export default defineTool({
  schema: listTasks,
  name: 'list-tasks',
  operation: 'query',
  auth: 'required',
  handler: async (_args, _extra, ctx) => {
    const tasks = await ctx.query(api.tasks.list)
    return ctx.ok(
      { count: tasks.length, tasks },
      `Found ${tasks.length} task${tasks.length === 1 ? '' : 's'}`,
    )
  },
})
