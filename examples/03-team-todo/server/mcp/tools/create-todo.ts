/**
 * Why this file exists:
 * This tool shows the "happy path" of MCP integration:
 * tool authors call `ctx.mutation(...)` and the service-auth plumbing stays hidden.
 */
import { defineTool } from '#convex/mcp'

import { api } from '~/convex/_generated/api'
import { createTodo } from '~/shared/schemas/todo'

export default defineTool({
  name: 'create-todo',
  schema: createTodo,
  auth: 'required',
  check: actor => ['owner', 'admin', 'member'].includes(actor.role),
  scoped: true,
  handler: async (args, ctx) => {
    const todoId = await ctx.mutation(api.todos.create, args)
    return ctx.ok({ id: todoId }, `Created todo "${args.title}"`)
  },
})
