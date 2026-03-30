/**
 * Why this file exists:
 * Upload URLs and storage lookups are a legitimate reason to use the raw Convex escape hatch.
 * This handler only needs "are you signed in?" because the actual file becomes workspace-scoped
 * later when comments attach the returned storage id.
 */
import { guard } from 'better-convex-nuxt/auth'
import { mutation, query } from './_generated/server'
import { v } from 'convex/values'

import { getActor } from './auth/actor'
import { isAuthenticated } from './auth/checks'

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx)
    // Upload URLs are actor-gated, but they are not tied to a specific task or project yet.
    guard(actor, 'Generate upload URL', isAuthenticated)
    return await ctx.storage.generateUploadUrl()
  },
})

export const getUrl = query({
  args: { storageId: v.id('_storage') },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId)
  },
})
