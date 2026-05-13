import { requireRecord } from '@lupinum/trellis/auth'
import {
  implementOperation,
  operationEffect,
  operationIssue,
  operationPreview,
  previewOf,
} from '@lupinum/trellis/backend'

import { publishPageDescriptor } from '../../../../../shared/features/pages/contract'
import type { Doc, Id } from '../../_generated/dataModel'
import { canManagePages, query } from '../../functions'

export const publishPageOp = implementOperation(publishPageDescriptor, {
  identityForwardingFunctionRef: 'features/pages/domain:publish',
  identityForwardingTransport: 'bridge',
  guard: canManagePages,
  load: async (ctx, args) => {
    const page = await ctx.db.get(args.id as Id<'pages'>)
    requireRecord(page, 'Page')
    return { page }
  },
  preview: async (_ctx, _args, { page }: { page: Doc<'pages'> }) =>
    operationPreview({
      summary: `Publish "${page.title}" at /${page.slug}`,
      warnings: [
        operationIssue({
          code: page.status === 'published' ? 'republish-page' : 'publish-page',
          message:
            page.status === 'published'
              ? 'This republishes the current page body with the latest draft.'
              : 'This will make the draft visible on the public site.',
        }),
      ],
      effects: [operationEffect({ kind: 'pages', summary: 'Pages published', count: 1 })],
      details: {
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

export const previewPublish = query.protected({
  ...previewOf(publishPageOp),
  identityForwardingFunctionRef: 'features/pages/operations:previewPublish',
  identityForwardingTransport: 'bridge',
})
