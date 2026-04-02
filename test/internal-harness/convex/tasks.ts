import { addTask } from '../shared/schemas/task'
import { appMutation } from './functions'

export const add = appMutation({
  args: addTask.args,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    if (!actor) {
      throw new Error('Authentication required.')
    }

    return await ctx.db.insert('tasks', {
      userId: actor.userId,
      title: args.title,
      completed: false,
      createdAt: Date.now(),
    })
  },
})
