import { withTrustedCaller, withTrustedCallerHandler } from 'better-convex-nuxt/trusted-caller'

import { addTask } from '../shared/schemas/task'
import { mutation } from './_generated/server'
import { getActor } from './auth/actor'

export const add = mutation({
  args: withTrustedCaller(addTask.args),
  handler: withTrustedCallerHandler(async (ctx, args) => {
    const actor = await getActor(ctx)
    if (!actor) {
      throw new Error('Authentication required.')
    }

    return await ctx.db.insert('tasks', {
      userId: actor.userId,
      title: args.title,
      completed: false,
      createdAt: Date.now(),
    })
  }),
})
