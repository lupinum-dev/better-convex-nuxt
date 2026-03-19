import { privateQuery } from './helpers'

export const systemOverview = privateQuery({
  args: {},
  handler: async (ctx) => {
    const [notes, tasks, users] = await Promise.all([
      ctx.db.query('notes').collect(),
      ctx.db.query('tasks').collect(),
      ctx.db.query('users').collect(),
    ])

    return {
      lane: 'privileged',
      notes: notes.length,
      tasks: tasks.length,
      users: users.length,
      generatedAt: Date.now(),
    }
  },
})
