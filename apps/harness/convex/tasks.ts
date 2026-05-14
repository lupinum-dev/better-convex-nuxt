import { defineGuard } from '@lupinum/trellis/auth'

import { addTask } from '../shared/schemas/task'
import type { AppIdentity } from './auth/appIdentity'
import { mutation } from './functions'

const canAddTask = defineGuard<AppIdentity>('task.add', (appIdentity) => appIdentity !== null)

export const add = mutation.protected({
  args: addTask.args,
  guard: canAddTask,
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()

    return await ctx.db.insert('tasks', {
      userId: appIdentity.userId,
      title: args.title,
      completed: false,
      createdAt: Date.now(),
    })
  },
})
