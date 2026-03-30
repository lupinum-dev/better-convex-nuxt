/**
 * Why this file exists:
 * This tool reuses the same schema as the UI and shows permission-aware updates.
 */
import { defineTool } from '#convex/mcp'

import { api } from '~/convex/_generated/api'
import { setTodoCompleted } from '~/shared/schemas/todo'

export default defineTool({
  name: 'complete-todo',
  schema: setTodoCompleted,
  auth: 'required',
  require: 'todo.update',
  scoped: true,
  handler: async (args, _extra, ctx) => {
    await ctx.mutation(api.todos.setCompleted, {
      id: args.id,
      completed: args.completed,
    })

    return ctx.ok(
      { id: args.id, completed: args.completed },
      args.completed ? 'Marked todo complete' : 'Marked todo incomplete',
    )
  },
})
