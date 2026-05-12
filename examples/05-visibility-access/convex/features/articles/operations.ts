import { deny, loadTenantResource as loadResource } from '@lupinum/trellis/auth'
import {
  defineOperation,
  operationEffect,
  operationIssue,
  operationPreview,
  operationPreviewValidator,
  previewOf,
} from '@lupinum/trellis/backend'
import { v } from 'convex/values'

import { revokeArticleShareToken } from '../../../shared/features/articles/contract'
import { query } from '../../functions'
import { shareCreate } from './permissions'

export const revokeShareTokenOp = defineOperation({
  id: 'shareTokens.revoke',
  name: 'revokeShareToken',
  kind: 'destructive',
  args: revokeArticleShareToken.args,
  returns: v.null(),
  previewReturns: operationPreviewValidator({
    confirm: v.object({
      operation: v.literal('shareTokens.revoke'),
      targetId: v.id('shareTokens'),
      affectedCounts: v.object({
        shareTokens: v.number(),
      }),
    }),
  }),
  guard: shareCreate,
  load: async (ctx, args) => {
    const actor = await ctx.actor()
    const token = loadResource(actor, await ctx.db.get(args.tokenId), 'Share token')
    return { token }
  },
  preview: async (_ctx, _args, { token }) =>
    operationPreview({
      summary: `Will revoke ${token.prefix}.`,
      warnings: [
        operationIssue({
          code: 'shared-links-stop-working',
          message: 'Existing shared links using this token will stop working immediately.',
        }),
      ],
      effects: [
        operationEffect({ kind: 'shareTokens', summary: 'Share tokens revoked', count: 1 }),
      ],
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

export const previewRevokeShareToken = query.protected(previewOf(revokeShareTokenOp))
