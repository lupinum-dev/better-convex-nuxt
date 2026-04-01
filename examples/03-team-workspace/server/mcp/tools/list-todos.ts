/**
 * Why this file exists:
 * This is the simplest MCP tool in the example: one schema, one permission, one scoped query.
 */
import { defineTool } from '#convex/mcp'
import { api } from '~/convex/_generated/api'
import { listTodos } from '~/shared/schemas/todo'

export default defineTool({
  name: 'list-todos',
  schema: listTodos,
  auth: 'required',
  check: (actor) => ['owner', 'admin', 'member', 'viewer'].includes(actor.role),
  scoped: true,
  handler: async (_args, ctx) => {
    const todos = await ctx.query(api.todos.list, {})
    return ctx.ok(todos, `Found ${todos.length} todos in the current workspace`)
  },
})
