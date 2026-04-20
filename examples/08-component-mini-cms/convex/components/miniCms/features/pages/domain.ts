import { open } from '@lupinum/trellis/auth'
import { v } from 'convex/values'

import {
  createPage,
  getPublishedPage,
  listDraftPages,
  listPublishedPages,
  listStudioPages,
  publishedPageValidator,
  saveDraft,
  studioPageValidator,
} from '../../../../../shared/features/pages/contract'
import type { Id } from '../../_generated/dataModel'
import { canManagePages, mutation, query } from '../../functions'
import { publishPageOp } from './operations'

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

export const listPublished = query({
  args: listPublishedPages.args,
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

export const getPublished = query({
  args: getPublishedPage.args,
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

export const listStudio = query({
  args: listStudioPages.args,
  returns: v.array(studioPageValidator),
  guard: canManagePages,
  handler: async (ctx) => {
    const pages = await ctx.db.query('pages').order('desc').collect()
    return pages.map(toStudioPage)
  },
})

export const listDraft = query({
  args: listDraftPages.args,
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

export const create = mutation({
  args: createPage.args,
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

export const save = mutation({
  args: saveDraft.args,
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

export const publish = mutation(publishPageOp)
