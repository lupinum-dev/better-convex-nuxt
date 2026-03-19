import { v } from 'convex/values'

import { query } from '../_generated/server'

function assertPrivateBridgeKey(apiKey: string): void {
  const expectedApiKey = process.env.CONVEX_PRIVATE_BRIDGE_KEY?.trim()
  if (!expectedApiKey) {
    throw new Error('Missing CONVEX_PRIVATE_BRIDGE_KEY')
  }
  if (apiKey !== expectedApiKey) {
    throw new Error('Invalid API key')
  }
}

export const systemOverview = query({
  args: {
    apiKey: v.string(),
  },
  handler: async (ctx, args) => {
    assertPrivateBridgeKey(args.apiKey)
    const { apiKey: _apiKey } = args

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
