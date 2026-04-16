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
import { mutation, query } from './functions'

const publishedPageListValidator = v.array(publishedPageValidator)
const studioPageListValidator = v.array(studioPageValidator)

export const listPublished = query({
  args: listPublishedPagesSchema.args,
  returns: publishedPageListValidator,
  guard: open,
  handler: async (ctx) =>
    await ctx.runQuery(components.miniCms.pages.listPublishedPages, {
      principal: await ctx.principal(),
    }),
})

export const getPublished = query({
  args: getPublishedPageSchema.args,
  returns: v.union(publishedPageValidator, v.null()),
  guard: open,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.miniCms.pages.getPublishedPage, {
      ...args,
      principal: await ctx.principal(),
    }),
})

export const listStudio = query({
  args: listStudioPagesSchema.args,
  returns: studioPageListValidator,
  guard: open,
  handler: async (ctx) =>
    await ctx.runQuery(components.miniCms.pages.listStudioPages, {
      principal: await ctx.principal(),
    }),
})

export const create = mutation({
  args: createPageSchema.args,
  returns: v.string(),
  guard: open,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.miniCms.pages.createPage, {
      ...args,
      principal: await ctx.principal(),
    }),
})

export const save = mutation({
  args: saveDraftSchema.args,
  returns: v.null(),
  guard: open,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.miniCms.pages.saveDraft, {
      ...args,
      principal: await ctx.principal(),
    }),
})

export const publish = mutation({
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
