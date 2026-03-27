import { v } from 'convex/values'

import { mutation, query } from './_generated/server'

/**
 * Generate a signed upload URL for file storage.
 * This is required by useConvexUpload.
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl()
  },
})

/**
 * Get a signed URL for a file in storage.
 * This is used by useConvexStorageUrl.
 */
export const getUrl = query({
  args: { storageId: v.id('_storage') },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId)
  },
})

/**
 * Delete a file from storage.
 */
export const deleteFile = mutation({
  args: { storageId: v.id('_storage') },
  handler: async (ctx, args) => {
    await ctx.storage.delete(args.storageId)
  },
})
