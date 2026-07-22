import { v } from 'convex/values'

import { internal } from './_generated/api'
import { internalAction } from './_generated/server'

export const generateReport = internalAction({
  args: {
    actor: v.object({ issuer: v.string(), subject: v.string() }),
    workspaceId: v.string(),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const snapshot = await ctx.runQuery(internal.application.reportSnapshot, args)
    if (!snapshot.ok) return snapshot
    return {
      ok: true as const,
      value: { ...snapshot.value, generatedAt: Date.now() },
    }
  },
})
