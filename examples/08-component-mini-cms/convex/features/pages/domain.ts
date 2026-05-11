import { createTrustedForwardingEnvelopeArgs } from '@lupinum/trellis/backend'
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

const bridgeForwardingIssuer = 'trellis://server'
const bridgeForwardingAudience = 'trellis://convex'

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
function getRequiredTrustedForwardingKey(): string {
  const key = process.env.CONVEX_TRUSTED_FORWARDING_KEY?.trim()
  if (!key) {
    throw new Error('Component mini CMS bridge calls require CONVEX_TRUSTED_FORWARDING_KEY.')
  }
  return key
}

async function bridgeForwardingArgs(
  ctx: { principal: () => Promise<MiniCmsPrincipal> },
  args: Record<string, unknown>,
  operation: 'query' | 'mutation' | 'action' | 'operation-execute',
  functionRef: string,
): Promise<Record<string, unknown>> {
  const principal = await ctx.principal()
  if (principal.kind === 'anonymous') return args

  const forwarding = createTrustedForwardingEnvelopeArgs({
    args: {},
    principal,
    key: getRequiredTrustedForwardingKey(),
    issuer: bridgeForwardingIssuer,
    audience: bridgeForwardingAudience,
    transport: 'bridge',
    purpose: operation,
    functionRef,
  })

  return {
    ...args,
    ...forwarding,
  }
}

const bridgeApi: typeof internal.features.pages.bridge = internal.features.pages.bridge

export const listPublished = query.public({
  args: listPublishedPagesSchema.args,
  returns: publishedPageListValidator,
  handler: async (ctx) =>
    await ctx.runQuery(
      bridgeApi.listPublished,
      await bridgeForwardingArgs(ctx, {}, 'query', 'features/pages/bridge:listPublished'),
    ),
})

export const getPublished = query.public({
  args: getPublishedPageSchema.args,
  returns: v.union(publishedPageValidator, v.null()),
  handler: async (ctx, args) =>
    await ctx.runQuery(
      bridgeApi.getPublished,
      await bridgeForwardingArgs(ctx, args, 'query', 'features/pages/bridge:getPublished'),
    ),
})

export const listStudio = query.public({
  args: listStudioPagesSchema.args,
  returns: studioPageListValidator,
  handler: async (ctx) =>
    await ctx.runQuery(
      bridgeApi.listStudio,
      await bridgeForwardingArgs(ctx, {}, 'query', 'features/pages/bridge:listStudio'),
    ),
})

export const listDraft = query.public({
  args: listDraftPagesSchema.args,
  returns: studioPageListValidator,
  handler: async (ctx) =>
    await ctx.runQuery(
      bridgeApi.listDraft,
      await bridgeForwardingArgs(ctx, {}, 'query', 'features/pages/bridge:listDraft'),
    ),
})

export const create = mutation.public({
  args: createPageSchema.args,
  returns: v.string(),
  handler: async (ctx, args) =>
    await ctx.runMutation(
      bridgeApi.create,
      await bridgeForwardingArgs(ctx, args, 'mutation', 'features/pages/bridge:create'),
    ),
})

export const save = mutation.public({
  args: saveDraftSchema.args,
  returns: v.null(),
  handler: async (ctx, args) =>
    await ctx.runMutation(
      bridgeApi.save,
      await bridgeForwardingArgs(ctx, args, 'mutation', 'features/pages/bridge:save'),
    ),
})

export const publish = mutation.public({
  args: publishPageSchema.args,
  returns: publishResultValidator,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      bridgeApi.publish,
      await bridgeForwardingArgs(ctx, args, 'mutation', 'features/pages/bridge:publish'),
    ),
})

export const publishAction = action.public({
  args: publishPageSchema.args,
  returns: publishResultValidator,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      bridgeApi.publish,
      await bridgeForwardingArgs(ctx, args, 'mutation', 'features/pages/bridge:publish'),
    ),
})

export const previewPublish = query.public({
  args: publishPageSchema.args,
  returns: publishPreviewResultValidator,
  handler: async (ctx, args) =>
    await ctx.runQuery(
      bridgeApi.previewPublish,
      await bridgeForwardingArgs(ctx, args, 'query', 'features/pages/bridge:previewPublish'),
    ),
})
