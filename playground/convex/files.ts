import { v } from 'convex/values'

import { mutation, query } from './_generated/server'

/**
 * Generate a signed upload URL for file storage.
 * This is required by useConvexFileUpload.
 *
 * Requires authentication - anonymous callers cannot mint upload URLs.
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error('Not authenticated')
    }

    return await ctx.storage.generateUploadUrl()
  },
})

/**
 * Record ownership of an uploaded file. Call this with the storageId returned
 * by `upload()` right after a successful upload - `getUrl`/`deleteFile` only
 * resolve/act on files with a recorded owner.
 */
export const saveFile = mutation({
  args: { storageId: v.id('_storage') },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error('Not authenticated')
    }

    // First registration wins: without this, a second insert for the same
    // storageId would let another caller contest ownership and would make the
    // `.unique()` lookups in getUrl/deleteFile throw.
    const existing = await ctx.db
      .query('files')
      .withIndex('by_storage', (q) => q.eq('storageId', args.storageId))
      .unique()
    if (existing) {
      throw new Error('File already registered')
    }

    await ctx.db.insert('files', {
      storageId: args.storageId,
      ownerId: identity.subject,
      createdAt: Date.now(),
    })
  },
})

/**
 * Get a signed URL for a file in storage.
 * This is used by useConvexStorageUrl.
 *
 * Only the file's owner can resolve its URL.
 */
export const getUrl = query({
  args: { storageId: v.id('_storage') },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      return null
    }

    const file = await ctx.db
      .query('files')
      .withIndex('by_storage', (q) => q.eq('storageId', args.storageId))
      .unique()

    if (!file || file.ownerId !== identity.subject) {
      return null
    }

    return await ctx.storage.getUrl(args.storageId)
  },
})

/**
 * Delete a file from storage.
 *
 * Only the file's owner can delete it.
 */
export const deleteFile = mutation({
  args: { storageId: v.id('_storage') },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error('Not authenticated')
    }

    const file = await ctx.db
      .query('files')
      .withIndex('by_storage', (q) => q.eq('storageId', args.storageId))
      .unique()

    if (!file || file.ownerId !== identity.subject) {
      throw new Error('Not authorized')
    }

    await ctx.db.delete(file._id)
    await ctx.storage.delete(args.storageId)
  },
})
