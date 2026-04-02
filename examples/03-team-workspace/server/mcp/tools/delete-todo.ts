/**
 * Why this file exists:
 * Destructive tools should preview the change first.
 * This example keeps that flow small enough to understand in one read.
 */
import { defineTool } from '#trellis/mcp'
import { api } from '#trellis/api'
import { deleteTodo } from '~/shared/schemas/todo'

export default defineTool({
  name: 'delete-todo',
  schema: deleteTodo,
  auth: 'required',
  check: (actor) => !!actor && ['owner', 'admin', 'member'].includes(actor.role),
  scoped: true,
  destructive: true,
  preview: async (args, ctx) => {
    const todo = await ctx.query(api.todos.get, { id: args.id })
    if (!todo) {
      return ctx.blocked('Todo not found')
    }

    return ctx.preview({
      summary: `Will permanently delete "${todo.title}"`,
      warn: 'This cannot be undone',
      affects: { todos: 1 },
    })
  },
  handler: async (args, ctx) => {
    await ctx.mutation(api.todos.remove, args)
    return ctx.ok({ deleted: true, id: args.id }, 'Deleted todo')
  },
})
