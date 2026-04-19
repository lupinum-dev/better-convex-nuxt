import { deny, loadTenantResource as loadResource } from '@lupinum/trellis/auth'
import { defineOperation, previewOf } from '@lupinum/trellis/functions'
import { v } from 'convex/values'

import { canCreateShareToken } from '../auth/checks'
import { query } from '../functions'

export const revokeShareTokenOp = defineOperation({
  id: 'shareTokens.revoke',
  name: 'revokeShareToken',
  kind: 'destructive',
  args: { tokenId: v.id('shareTokens') },
  returns: v.null(),
  previewReturns: v.object({
    display: v.object({
      summary: v.string(),
      warn: v.string(),
      affects: v.object({
        shareTokens: v.number(),
      }),
    }),
    confirm: v.object({
      operation: v.literal('shareTokens.revoke'),
      targetId: v.id('shareTokens'),
      affectedCounts: v.object({
        shareTokens: v.number(),
      }),
    }),
  }),
  guard: canCreateShareToken as never,
  load: async (ctx, args) => {
    const actor = await ctx.actor()
    const token = loadResource(actor, await ctx.db.get(args.tokenId), 'Share token')
    return { token }
  },
  preview: async (_ctx, _args, { token }) => ({
    display: {
      summary: `Will revoke ${token.prefix}.`,
      warn: 'Existing shared links using this token will stop working immediately.',
      affects: { shareTokens: 1 },
    },
    confirm: {
      operation: 'shareTokens.revoke',
      targetId: token._id,
      affectedCounts: { shareTokens: 1 },
    },
  }),
  handler: async (ctx, args, { token }) => {
    if (token.revokedAt) throw deny('Already revoked.')
    await ctx.db.patch(args.tokenId, { revokedAt: Date.now() })
    return null
  },
})

export const previewRevokeShareToken = query(previewOf(revokeShareTokenOp))
