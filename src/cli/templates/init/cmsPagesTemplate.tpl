import { open, requireRecord } from '@lupinum/trellis/auth'
import { defineOperation, previewOf } from '@lupinum/trellis/backend'
import { v } from 'convex/values'

import {
  createPage as createPageSchema,
  getPublishedPage as getPublishedPageSchema,
  listPublishedPages as listPublishedPagesSchema,
  listStudioPages as listStudioPagesSchema,
  publishPage as publishPageSchema,
  publishPreviewValidator,
  publishedPageValidator,
  saveDraft as saveDraftSchema,
  studioPageValidator,
} from '../../../shared/features/pages/contract'
import { canEditPage, canPublishPage, isAuthenticated } from '../../auth/guards'
import { mutation, query } from '../../functions'

export const listPublished = query({
  args: listPublishedPagesSchema.args,
  returns: v.array(publishedPageValidator),
  guard: open,
  handler: async (ctx) =>
    await ctx.db
      .query('pages')
      .withIndex('by_status', (q) => q.eq('status', 'published'))
      .order('desc')
      .collect()
      .then((pages) =>
        pages.map((page) => ({
          _id: page._id,
          slug: page.slug,
          title: page.title,
          body: page.publishedBody,
          status: page.status,
          authorId: page.authorId,
          updatedAt: page.updatedAt,
          publishedAt: page.publishedAt ?? null,
        })),
      ),
})

export const getPublished = query({
  args: getPublishedPageSchema.args,
  returns: v.union(publishedPageValidator, v.null()),
  guard: open,
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query('pages')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .first()

    if (!page || page.status !== 'published') {
      return null
    }

    return {
      _id: page._id,
      slug: page.slug,
      title: page.title,
      body: page.publishedBody,
      status: page.status,
      authorId: page.authorId,
      updatedAt: page.updatedAt,
      publishedAt: page.publishedAt ?? null,
    }
  },
})

export const listStudio = query({
  args: listStudioPagesSchema.args,
  returns: v.array(studioPageValidator),
  guard: isAuthenticated,
  handler: async (ctx) => {
    const actor = await ctx.actor()

    return await ctx.db
      .query('pages')
      .withIndex('by_author', (q) => q.eq('authorId', actor.userId))
      .order('desc')
      .collect()
      .then((pages) =>
        pages.map((page) => ({
          _id: page._id,
          slug: page.slug,
          title: page.title,
          draftBody: page.draftBody,
          publishedBody: page.publishedBody,
          status: page.status,
          authorId: page.authorId,
          updatedAt: page.updatedAt,
          publishedAt: page.publishedAt ?? null,
        })),
      )
  },
})

export const create = mutation({
  args: createPageSchema.args,
  returns: v.id('pages'),
  guard: isAuthenticated,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    const now = Date.now()

    return await ctx.db.insert('pages', {
      slug: args.slug,
      title: args.title,
      draftBody: args.draftBody ?? '',
      publishedBody: '',
      status: 'draft',
      authorId: actor.userId,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const save = mutation({
  args: saveDraftSchema.args,
  returns: v.null(),
  guard: isAuthenticated,
  load: async (ctx, args) => {
    const page = await ctx.db.get(args.id)
    requireRecord(page, 'Page')
    return { page }
  },
  authorize: {
    check: (_actor, { page }) => canEditPage(page),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      slug: args.slug,
      title: args.title,
      draftBody: args.draftBody,
      updatedAt: Date.now(),
    })
    return null
  },
})

const publishPageOp = defineOperation({
  name: 'publishPage',
  args: publishPageSchema.args,
  returns: v.object({
    pageId: v.id('pages'),
    published: v.boolean(),
  }),
  previewReturns: v.object({
    display: publishPreviewValidator,
    confirm: v.object({
      targetId: v.id('pages'),
      slug: v.string(),
    }),
  }),
  guard: isAuthenticated,
  load: async (ctx, args) => {
    const page = await ctx.db.get(args.id)
    requireRecord(page, 'Page')
    return { page }
  },
  authorize: {
    check: (_actor, { page }) => canPublishPage(page),
  },
  preview: async (_ctx, _args, { page }) => ({
    display: {
      summary:
        page.status === 'published'
          ? `Republish "${page.title}" with the current draft.`
          : `Publish "${page.title}" to the public site.`,
      warn: 'Publishing copies the current draft into the public body.',
      affects: {
        pages: 1,
      },
    },
    confirm: {
      targetId: page._id,
      slug: page.slug,
    },
  }),
  handler: async (ctx, args, { page }) => {
    const now = Date.now()

    await ctx.db.patch(args.id, {
      publishedBody: page.draftBody,
      status: 'published',
      publishedAt: now,
      updatedAt: now,
    })

    return {
      pageId: args.id,
      published: true,
    }
  },
})

export const publish = mutation(publishPageOp)
export const previewPublish = query(previewOf(publishPageOp))
