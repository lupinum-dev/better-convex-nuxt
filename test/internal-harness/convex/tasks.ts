import { defineGuard } from '@lupinum/trellis/auth'

import { addTask } from '../shared/schemas/task'
import type { Actor } from './auth/actor'
import { app } from './functions'

const canAddTask = defineGuard<Actor>('task.add', (actor) => actor !== null)

export const add = app.mutation({
  args: addTask.args,
  guard: canAddTask,
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
