import { open, requireRecord } from '@lupinum/trellis/auth'
import { defineOperation, previewOf } from '@lupinum/trellis/functions'
import { v } from 'convex/values'

import type { MiniCmsPrincipal } from '../../../shared/principal'
import {
  createPage as createPageSchema,
  getPublishedPage as getPublishedPageSchema,
  listDraftPages as listDraftPagesSchema,
  listPublishedPages as listPublishedPagesSchema,
  listStudioPages as listStudioPagesSchema,
  publishPage as publishPageSchema,
  publishPreviewValidator,
  publishedPageValidator,
  saveDraft as saveDraftSchema,
  studioPageValidator,
} from '../../domain/page.contract'
import type { Doc, Id } from './_generated/dataModel'
import { canManagePages, mutation, query, type MiniCmsActor } from './functions'

function toPublishedPage(page: {
  _id: Id<'pages'>
  slug: string
  title: string
  publishedBody: string
  status: 'draft' | 'published'
  updatedAt: number
  publishedAt?: number
  authorId: string
}) {
  return {
    _id: page._id,
    slug: page.slug,
    title: page.title,
    body: page.publishedBody,
    status: page.status,
    updatedAt: page.updatedAt,
    publishedAt: page.publishedAt ?? null,
    authorId: page.authorId,
  }
}

function toStudioPage(page: {
  _id: Id<'pages'>
  slug: string
  title: string
  draftBody: string
  publishedBody: string
  status: 'draft' | 'published'
  updatedAt: number
  publishedAt?: number
  authorId: string
}) {
  return {
    _id: page._id,
    slug: page.slug,
    title: page.title,
    draftBody: page.draftBody,
    publishedBody: page.publishedBody,
    status: page.status,
    updatedAt: page.updatedAt,
    publishedAt: page.publishedAt ?? null,
    authorId: page.authorId,
  }
}

const publishPageOp = defineOperation({
  id: 'pages.publish',
  name: 'publishPage',
  kind: 'destructive',
  args: publishPageSchema.args,
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
  guard: canManagePages as never,
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

export { publishPageOp }

export const listPublishedPages = query({
  args: listPublishedPagesSchema.args,
  returns: v.array(publishedPageValidator),
  guard: open,
  handler: async (ctx) => {
    const pages = await ctx.db
      .query('pages')
      .withIndex('by_status', (q) => q.eq('status', 'published'))
      .order('desc')
      .collect()

    return pages.map(toPublishedPage)
  },
})

export const getPublishedPage = query({
  args: getPublishedPageSchema.args,
  returns: v.union(publishedPageValidator, v.null()),
  guard: open,
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query('pages')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .unique()

    if (!page || page.status !== 'published') return null
    return toPublishedPage(page)
  },
})

export const listStudioPages = query({
  args: listStudioPagesSchema.args,
  returns: v.array(studioPageValidator),
  guard: canManagePages,
  handler: async (ctx) => {
    const pages = await ctx.db.query('pages').order('desc').collect()
    return pages.map(toStudioPage)
  },
})

export const listDraftPages = query({
  args: listDraftPagesSchema.args,
  returns: v.array(studioPageValidator),
  guard: canManagePages,
  handler: async (ctx) => {
    const pages = await ctx.db
      .query('pages')
      .withIndex('by_status', (q) => q.eq('status', 'draft'))
      .order('desc')
      .collect()

    return pages.map(toStudioPage)
  },
})

export const createPage = mutation({
  args: createPageSchema.args,
  returns: v.string(),
  guard: canManagePages,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    const authorId =
      actor.kind === 'agent'
        ? `agent:${actor.agentId}`
        : actor.kind === 'editor'
          ? actor.userId
          : (() => {
              throw new Error('Viewer cannot create pages.')
            })()

    const now = Date.now()
    return await ctx.db.insert('pages', {
      slug: args.slug.trim(),
      title: args.title.trim(),
      draftBody: args.draftBody?.trim() ?? '',
      publishedBody: '',
      status: 'draft',
      updatedAt: now,
      authorId,
    })
  },
})

export const saveDraft = mutation({
  args: saveDraftSchema.args,
  returns: v.null(),
  guard: canManagePages,
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id as Id<'pages'>, {
      slug: args.slug.trim(),
      title: args.title.trim(),
      draftBody: args.draftBody,
      updatedAt: Date.now(),
    })
    return null
  },
})

export const publishPage = mutation(publishPageOp)

export const previewPublishPage = query(previewOf(publishPageOp))
