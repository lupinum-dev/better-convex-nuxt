import { defineConvexSchema } from 'better-convex-nuxt/schema'
import { withSummary } from 'better-convex-nuxt/mcp'

import { api } from '../../../convex/_generated/api'
import { listTasksMeta } from '../../../shared/schemas/task'
import { defineConvexTool } from '../utils/tools'

const schema = defineConvexSchema({}, listTasksMeta)

export default defineConvexTool({
  schema,
  name: 'list-tasks',
  operation: 'query',
  auth: 'required',
  handler: async (_args, _extra, ctx) => {
    const tasks = await ctx.query(api.tasks.list)
    return withSummary(
      { count: tasks.length, tasks },
      `Found ${tasks.length} task${tasks.length === 1 ? '' : 's'}`,
    )
  },
})
