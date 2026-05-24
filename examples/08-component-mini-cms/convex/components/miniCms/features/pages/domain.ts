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
import { canManagePages, mutation, query, transportMutation } from '../../functions'
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

export const listPublished = query.public({
  args: listPublishedPages.args,
  returns: v.array(publishedPageValidator),
  identityForwardingFunctionRef: 'features/pages/domain:listPublished',
  identityForwardingTransport: 'bridge',
  handler: async (ctx) => {
    const pages = await ctx.db
      .query('pages')
      .withIndex('by_status', (q) => q.eq('status', 'published'))
      .order('desc')
      .collect()

    return pages.map(toPublishedPage)
  },
})

export const getPublished = query.public({
  args: getPublishedPage.args,
  returns: v.union(publishedPageValidator, v.null()),
  identityForwardingFunctionRef: 'features/pages/domain:getPublished',
  identityForwardingTransport: 'bridge',
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query('pages')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .unique()

    if (!page || page.status !== 'published') return null
    return toPublishedPage(page)
  },
})

export const listStudio = query.protected({
  args: listStudioPages.args,
  returns: v.array(studioPageValidator),
  identityForwardingFunctionRef: 'features/pages/domain:listStudio',
  identityForwardingTransport: 'bridge',
  guard: canManagePages,
  handler: async (ctx) => {
    const pages = await ctx.db.query('pages').order('desc').collect()
    return pages.map(toStudioPage)
  },
})

export const listDraft = query.protected({
  args: listDraftPages.args,
  returns: v.array(studioPageValidator),
  identityForwardingFunctionRef: 'features/pages/domain:listDraft',
  identityForwardingTransport: 'bridge',
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

export const create = mutation.protected({
  args: createPage.args,
  returns: v.string(),
  identityForwardingFunctionRef: 'features/pages/domain:create',
  identityForwardingTransport: 'bridge',
  guard: canManagePages,
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    const authorId =
      appIdentity.kind === 'agent'
        ? `agent:${appIdentity.agentId}`
        : appIdentity.kind === 'editor'
          ? appIdentity.authKey
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

export const save = mutation.protected({
  args: saveDraft.args,
  returns: v.null(),
  identityForwardingFunctionRef: 'features/pages/domain:save',
  identityForwardingTransport: 'bridge',
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

export const publish = transportMutation(publishPageOp)
