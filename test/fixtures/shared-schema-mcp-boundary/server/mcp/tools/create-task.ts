import { defineConvexMcpTool } from 'better-convex-nuxt/mcp'
import { defineConvexSchema } from 'better-convex-nuxt/schema'

import { createTaskArgs, createTaskMeta } from '../../../shared/task'

const schema = defineConvexSchema(createTaskArgs, createTaskMeta)

export default defineConvexMcpTool({
  name: 'create-task',
  schema,
  handler: async (args) => args.title,
})
