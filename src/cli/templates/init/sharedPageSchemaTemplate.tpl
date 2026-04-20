import { defineArgs } from '@lupinum/trellis/args'
import { v } from 'convex/values'

export const pageStatusValidator = v.union(v.literal('draft'), v.literal('published'))

export const publishedPageValidator = v.object({
  _id: v.id('pages'),
  slug: v.string(),
  title: v.string(),
  body: v.string(),
  status: pageStatusValidator,
  authorId: v.string(),
  updatedAt: v.number(),
  publishedAt: v.union(v.number(), v.null()),
})

export const studioPageValidator = v.object({
  _id: v.id('pages'),
  slug: v.string(),
  title: v.string(),
  draftBody: v.string(),
  publishedBody: v.string(),
  status: pageStatusValidator,
  authorId: v.string(),
  updatedAt: v.number(),
  publishedAt: v.union(v.number(), v.null()),
})

export const publishPreviewValidator = v.object({
  summary: v.string(),
  warn: v.optional(v.string()),
  affects: v.optional(
    v.object({
      pages: v.number(),
    }),
  ),
})

export const listPublishedPages = defineArgs({
  description: 'List published pages for the public site',
  args: {},
})

export const getPublishedPage = defineArgs({
  description: 'Read one published page by slug',
  args: {
    slug: v.string(),
  },
})

export const listStudioPages = defineArgs({
  description: 'List pages visible in the signed-in studio',
  args: {},
})

export const createPage = defineArgs({
  description: 'Create a new page draft',
  args: {
    slug: v.string(),
    title: v.string(),
    draftBody: v.optional(v.string()),
  },
})

export const saveDraft = defineArgs({
  description: 'Save a page draft',
  args: {
    id: v.id('pages'),
    slug: v.string(),
    title: v.string(),
    draftBody: v.string(),
  },
})

export const publishPage = defineArgs({
  description: 'Publish a page draft',
  args: {
    id: v.id('pages'),
  },
})
