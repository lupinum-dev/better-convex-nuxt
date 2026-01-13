/**
 * Files Functions - Storage demo
 *
 * Demonstrates file uploads with useConvexFileUpload and useConvexStorageUrl.
 */

import { v } from 'convex/values'
import { mutation, query } from './_generated/server'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/']

/**
 * Generate a URL for uploading a file
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error('Not authenticated')
    }

    // Check user role - only admin and member can upload
    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', (q) => q.eq('authId', identity.subject))
      .first()

    if (!user || user.role === 'viewer') {
      throw new Error('Not authorized to upload files')
    }

    return await ctx.storage.generateUploadUrl()
  }
})

/**
 * Save file metadata after upload
 */
export const save = mutation({
  args: {
    storageId: v.id('_storage'),
    filename: v.string(),
    mimeType: v.string(),
    size: v.number()
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error('Not authenticated')
    }

    // Check user role - only admin and member can upload
    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', (q) => q.eq('authId', identity.subject))
      .first()

    if (!user || user.role === 'viewer') {
      // Clean up the uploaded file since user isn't authorized
      await ctx.storage.delete(args.storageId)
      throw new Error('Not authorized to upload files')
    }

    // Validate file size
    if (args.size > MAX_FILE_SIZE) {
      await ctx.storage.delete(args.storageId)
      throw new Error('File size must be less than 5MB')
    }

    // Validate file type - must be an image
    const isAllowedType = ALLOWED_TYPES.some((type) => args.mimeType.startsWith(type))
    if (!isAllowedType) {
      await ctx.storage.delete(args.storageId)
      throw new Error('Only image files are allowed')
    }

    const fileId = await ctx.db.insert('files', {
      storageId: args.storageId,
      filename: args.filename,
      mimeType: args.mimeType,
      size: args.size,
      uploadedBy: identity.subject,
      createdAt: Date.now()
    })

    return fileId
  }
})

/**
 * Get a URL to access a stored file
 */
export const getUrl = query({
  args: {
    storageId: v.id('_storage')
  },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId)
  }
})

/**
 * List all uploaded files
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const files = await ctx.db
      .query('files')
      .withIndex('by_created')
      .order('desc')
      .take(50)

    return files
  }
})

/**
 * Delete a file
 */
export const remove = mutation({
  args: {
    id: v.id('files')
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error('Not authenticated')
    }

    const file = await ctx.db.get(args.id)
    if (!file) {
      throw new Error('File not found')
    }

    // Check user role and ownership
    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', (q) => q.eq('authId', identity.subject))
      .first()

    const isOwner = file.uploadedBy === identity.subject
    const isAdmin = user?.role === 'admin'
    const isMember = user?.role === 'member'

    // Admins can delete any file
    // Members can only delete their own files
    // Viewers cannot delete any files
    if (!isAdmin && !(isMember && isOwner)) {
      throw new Error('Not authorized to delete this file')
    }

    // Delete from storage
    await ctx.storage.delete(file.storageId)

    // Delete metadata
    await ctx.db.delete(args.id)
  }
})
