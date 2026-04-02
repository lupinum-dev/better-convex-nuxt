import { addTask } from '../shared/schemas/task'
import { app } from './functions'

export const add = app.mutation({
  args: addTask.args,
  guard: (actor) => actor !== null,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()

    return await ctx.db.insert('tasks', {
      userId: actor.userId,
      title: args.title,
      completed: false,
      createdAt: Date.now(),
    })
  },
})
