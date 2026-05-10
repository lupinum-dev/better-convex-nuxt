import { v } from 'convex/values'

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
} from '../../../shared/features/pages/contract'
import type { MiniCmsPrincipal } from '../../../shared/principal'
import { internal } from '../../_generated/api'
import { action, mutation, query } from '../../functions'

const publishedPageListValidator = v.array(publishedPageValidator)
const studioPageListValidator = v.array(studioPageValidator)
const publishResultValidator = v.object({
  pageId: v.string(),
  published: v.boolean(),
})
const publishPreviewResultValidator = v.object({
  display: publishPreviewValidator,
  confirm: v.object({
    operation: v.literal('pages.publish'),
    targetId: v.string(),
    affectedCounts: v.object({
      pages: v.number(),
    }),
  }),
})
async function bridgePrincipalArgs(ctx: {
  principal: () => Promise<MiniCmsPrincipal>
}): Promise<{ principal?: Exclude<MiniCmsPrincipal, { kind: 'anonymous' }> }> {
  const principal = await ctx.principal()
  return principal.kind === 'anonymous' ? {} : { principal }
}

const bridgeApi: typeof internal.features.pages.bridge = internal.features.pages.bridge

export const listPublished = query.public({
  args: listPublishedPagesSchema.args,
  returns: publishedPageListValidator,
  handler: async (ctx) =>
    await ctx.runQuery(bridgeApi.listPublished, await bridgePrincipalArgs(ctx)),
})

export const getPublished = query.public({
  args: getPublishedPageSchema.args,
  returns: v.union(publishedPageValidator, v.null()),
  handler: async (ctx, args) =>
    await ctx.runQuery(bridgeApi.getPublished, {
      ...args,
      ...(await bridgePrincipalArgs(ctx)),
    }),
})

export const listStudio = query.public({
  args: listStudioPagesSchema.args,
  returns: studioPageListValidator,
  handler: async (ctx) => await ctx.runQuery(bridgeApi.listStudio, await bridgePrincipalArgs(ctx)),
})

export const listDraft = query.public({
  args: listDraftPagesSchema.args,
  returns: studioPageListValidator,
  handler: async (ctx) => await ctx.runQuery(bridgeApi.listDraft, await bridgePrincipalArgs(ctx)),
})

export const create = mutation.public({
  args: createPageSchema.args,
  returns: v.string(),
  handler: async (ctx, args) =>
    await ctx.runMutation(bridgeApi.create, {
      ...args,
      ...(await bridgePrincipalArgs(ctx)),
    }),
})

export const save = mutation.public({
  args: saveDraftSchema.args,
  returns: v.null(),
  handler: async (ctx, args) =>
    await ctx.runMutation(bridgeApi.save, {
      ...args,
      ...(await bridgePrincipalArgs(ctx)),
    }),
})

export const publish = mutation.public({
  args: publishPageSchema.args,
  returns: publishResultValidator,
  handler: async (ctx, args) =>
    await ctx.runMutation(bridgeApi.publish, {
      ...args,
      ...(await bridgePrincipalArgs(ctx)),
    }),
})

export const publishAction = action.public({
  args: publishPageSchema.args,
  returns: publishResultValidator,
  handler: async (ctx, args) =>
    await ctx.runMutation(bridgeApi.publish, {
      ...args,
      ...(await bridgePrincipalArgs(ctx)),
    }),
})

export const previewPublish = query.public({
  args: publishPageSchema.args,
  returns: publishPreviewResultValidator,
  handler: async (ctx, args) =>
    await ctx.runQuery(bridgeApi.previewPublish, {
      ...args,
      ...(await bridgePrincipalArgs(ctx)),
    }),
})
