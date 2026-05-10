import { requireRecord } from '@lupinum/trellis/auth'
import { defineOperation, previewOf } from '@lupinum/trellis/backend'
import { v } from 'convex/values'

import { publishPage, publishPreviewValidator } from '../../../../../shared/features/pages/contract'
import type { Doc, Id } from '../../_generated/dataModel'
import { canManagePages, query } from '../../functions'

export const publishPageOp = defineOperation({
  id: 'pages.publish',
  name: 'publishPage',
  kind: 'destructive',
  args: publishPage.args,
  returns: v.object({
    pageId: v.string(),
    published: v.boolean(),
  }),
  previewReturns: v.object({
    display: publishPreviewValidator,
    confirm: v.object({
      operation: v.literal('pages.publish'),
      targetId: v.string(),
      affectedCounts: v.object({
        pages: v.number(),
      }),
    }),
  }),
  guard: canManagePages,
  load: async (ctx, args) => {
    const page = await ctx.db.get(args.id as Id<'pages'>)
    requireRecord(page, 'Page')
    return { page }
  },
  preview: async (_ctx, _args, { page }: { page: Doc<'pages'> }) => ({
    display: {
      summary: `Publish "${page.title}" at /${page.slug}`,
      warn:
        page.status === 'published'
          ? 'This republishes the current page body with the latest draft.'
          : 'This will make the draft visible on the public site.',
      affects: { pages: 1 },
    },
    confirm: {
      operation: 'pages.publish',
      targetId: page._id,
      affectedCounts: { pages: 1 },
    },
  }),
  handler: async (ctx, _args, { page }: { page: Doc<'pages'> }) => {
    const now = Date.now()
    await ctx.db.patch(page._id, {
      publishedBody: page.draftBody,
      status: 'published',
      updatedAt: now,
      publishedAt: now,
    })

    return {
      pageId: page._id,
      published: true,
    }
  },
})

export const previewPublish = query.protected(previewOf(publishPageOp))
