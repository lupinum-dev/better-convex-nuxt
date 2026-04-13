import { open } from '@lupinum/trellis/auth'
import { v } from 'convex/values'

import {
  createPage as createPageSchema,
  getPublishedPage as getPublishedPageSchema,
  listPublishedPages as listPublishedPagesSchema,
  listStudioPages as listStudioPagesSchema,
  publishPage as publishPageSchema,
  publishedPageValidator,
  saveDraft as saveDraftSchema,
  studioPageValidator,
} from '../shared/schemas/page'
import { components } from './_generated/api'
import { app } from './functions'

const publishedPageListValidator = v.array(publishedPageValidator)
const studioPageListValidator = v.array(studioPageValidator)

export const listPublished = app.query({
  args: listPublishedPagesSchema.args,
  returns: publishedPageListValidator,
  guard: open,
  handler: async (ctx) =>
    await ctx.runQuery(components.miniCms.pages.listPublishedPages, {
      principal: await ctx.principal(),
    }),
})

export const getPublished = app.query({
  args: getPublishedPageSchema.args,
  returns: v.union(publishedPageValidator, v.null()),
  guard: open,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.miniCms.pages.getPublishedPage, {
      ...args,
      principal: await ctx.principal(),
    }),
})

export const listStudio = app.query({
  args: listStudioPagesSchema.args,
  returns: studioPageListValidator,
  guard: open,
  handler: async (ctx) =>
    await ctx.runQuery(components.miniCms.pages.listStudioPages, {
      principal: await ctx.principal(),
    }),
})

export const create = app.mutation({
  args: createPageSchema.args,
  returns: v.string(),
  guard: open,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.miniCms.pages.createPage, {
      ...args,
      principal: await ctx.principal(),
    }),
})

export const save = app.mutation({
  args: saveDraftSchema.args,
  returns: v.null(),
  guard: open,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.miniCms.pages.saveDraft, {
      ...args,
      principal: await ctx.principal(),
    }),
})

export const publish = app.mutation({
  args: publishPageSchema.args,
  returns: v.object({
    pageId: v.string(),
    published: v.boolean(),
  }),
  guard: open,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.miniCms.pages.publishPage, {
      ...args,
      principal: await ctx.principal(),
    }),
})
