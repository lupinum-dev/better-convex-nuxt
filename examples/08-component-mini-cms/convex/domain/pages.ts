import { open } from '@lupinum/trellis/auth'
import { v } from 'convex/values'

import type { MiniCmsPrincipal } from '../../shared/principal'
import {
  createPage as createPageSchema,
  getPublishedPage as getPublishedPageSchema,
  listPublishedPages as listPublishedPagesSchema,
  listStudioPages as listStudioPagesSchema,
  publishPage as publishPageSchema,
  publishedPageValidator,
  saveDraft as saveDraftSchema,
  studioPageValidator,
} from './page.contract'
import { internal } from '../_generated/api'
import { mutation, query } from '../functions'

const publishedPageListValidator = v.array(publishedPageValidator)
const studioPageListValidator = v.array(studioPageValidator)

async function bridgePrincipalArgs(ctx: {
  principal: () => Promise<MiniCmsPrincipal>
}): Promise<{ principal?: Exclude<MiniCmsPrincipal, { kind: 'anonymous' }> }> {
  const principal = await ctx.principal()
  return principal.kind === 'anonymous' ? {} : { principal }
}

export const listPublished = query({
  args: listPublishedPagesSchema.args,
  returns: publishedPageListValidator,
  guard: open,
  handler: async (ctx) =>
    await ctx.runQuery(
      internal.operations.miniCmsBridge.listPublishedPages,
      await bridgePrincipalArgs(ctx),
    ),
})

export const getPublished = query({
  args: getPublishedPageSchema.args,
  returns: v.union(publishedPageValidator, v.null()),
  guard: open,
  handler: async (ctx, args) =>
    await ctx.runQuery(internal.operations.miniCmsBridge.getPublishedPage, {
      ...args,
      ...(await bridgePrincipalArgs(ctx)),
    }),
})

export const listStudio = query({
  args: listStudioPagesSchema.args,
  returns: studioPageListValidator,
  guard: open,
  handler: async (ctx) =>
    await ctx.runQuery(
      internal.operations.miniCmsBridge.listStudioPages,
      await bridgePrincipalArgs(ctx),
    ),
})

export const create = mutation({
  args: createPageSchema.args,
  returns: v.string(),
  guard: open,
  handler: async (ctx, args) =>
    await ctx.runMutation(internal.operations.miniCmsBridge.createPage, {
      ...args,
      ...(await bridgePrincipalArgs(ctx)),
    }),
})

export const save = mutation({
  args: saveDraftSchema.args,
  returns: v.null(),
  guard: open,
  handler: async (ctx, args) =>
    await ctx.runMutation(internal.operations.miniCmsBridge.saveDraft, {
      ...args,
      ...(await bridgePrincipalArgs(ctx)),
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
    await ctx.runMutation(internal.operations.miniCmsBridge.publishPage, {
      ...args,
      ...(await bridgePrincipalArgs(ctx)),
    }),
})
