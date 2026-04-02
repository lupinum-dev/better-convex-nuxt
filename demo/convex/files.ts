/**
 * Files Functions - Storage demo
 *
 * Demonstrates file uploads with useConvexUpload and useConvexStorageUrl.
 */

import { can, enforce } from '@lupinum/trellis/auth'
import { v } from 'convex/values'

import { mutation, query } from './_generated/server'
import { getActor } from './auth/actor'
import { canDeleteFile, canUploadFile, canViewAll } from './auth/checks'
import { withCan } from './auth/resource'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/']

/**
 * Generate a URL for uploading a file
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx)
    enforce(actor, 'Generate upload URL', canUploadFile)

    return await ctx.storage.generateUploadUrl()
  },
})

/**
 * Save file metadata after upload
 */
export const save = mutation({
  args: {
    storageId: v.id('_storage'),
    filename: v.string(),
    mimeType: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    if (!can(actor, canUploadFile)) {
      await ctx.storage.delete(args.storageId)
      enforce(actor, 'Upload file', canUploadFile)
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
      uploadedBy: actor.userId,
      createdAt: Date.now(),
    })

    return fileId
  },
})

/**
 * Get a URL to access a stored file
 */
export const getUrl = query({
  args: {
    storageId: v.id('_storage'),
  },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId)
  },
})

/**
 * List all uploaded files with uploader info
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx)
    if (!actor) return []
    enforce(actor, 'Read files', canViewAll)

    const files = await ctx.db.query('files').withIndex('by_created').order('desc').take(50)

    // Fetch uploader info for each file
    const filesWithUploader = await Promise.all(
      files.map(async (file) => {
        const uploader = await ctx.db
          .query('users')
          .withIndex('by_auth_id', (q) => q.eq('authId', file.uploadedBy))
          .first()

        return {
          ...withCan(file, {
            'file.delete': can(actor, canDeleteFile(file)),
          }),
          uploaderName: uploader?.displayName || uploader?.email || 'Unknown',
          uploaderAvatarUrl: uploader?.avatarUrl,
        }
      }),
    )

    return filesWithUploader
  },
})

/**
 * Delete a file
 */
export const remove = mutation({
  args: {
    id: v.id('files'),
  },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    enforce(actor, 'Delete file', actor !== null)

    const file = await ctx.db.get(args.id)
    if (!file) {
      throw new Error('File not found')
    }
    enforce(actor, 'Delete file', canDeleteFile(file))

    // Delete from storage
    await ctx.storage.delete(file.storageId)

    // Delete metadata
    await ctx.db.delete(args.id)
  },
})
