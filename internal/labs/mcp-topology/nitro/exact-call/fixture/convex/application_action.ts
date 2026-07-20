import { v } from 'convex/values'

import { internal } from './_generated/api'
import { internalAction } from './_generated/server'

export const generateReport = internalAction({
  args: {
    actor: v.object({ issuer: v.string(), subject: v.string() }),
    requestKey: v.string(),
    workspaceId: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { code: string; ok: false }
    | {
        ok: true
        value: {
          noteCount: number
          reportId: string
          requestKey: string
          workspaceId: string
        }
      }
  > => ctx.runMutation(internal.application.createReportReceipt, args),
})
