import { internalMutation } from './_generated/server'

export const purgeOldData = internalMutation({
  handler: async (ctx) => {
    const cutoff = Date.now() - 12 * 60 * 60 * 1000 // 12h ago

    // Delete old demo tasks
    const oldTasks = await ctx.db
      .query('demoTasks')
      .withIndex('by_created', (q) => q.lt('createdAt', cutoff))
      .take(100)
    for (const task of oldTasks) {
      await ctx.db.delete(task._id)
    }

    // Delete old files + storage blobs
    const oldFiles = await ctx.db
      .query('files')
      .withIndex('by_created', (q) => q.lt('createdAt', cutoff))
      .take(100)
    for (const file of oldFiles) {
      await ctx.storage.delete(file.storageId)
      await ctx.db.delete(file._id)
    }

    // Delete old messages
    const oldMessages = await ctx.db
      .query('messages')
      .withIndex('by_created', (q) => q.lt('createdAt', cutoff))
      .take(100)
    for (const msg of oldMessages) {
      await ctx.db.delete(msg._id)
    }

    // Delete old feed items
    const oldFeedItems = await ctx.db
      .query('feedItems')
      .withIndex('by_created', (q) => q.lt('createdAt', cutoff))
      .take(100)
    for (const item of oldFeedItems) {
      await ctx.db.delete(item._id)
    }

    return {
      deletedTasks: oldTasks.length,
      deletedFiles: oldFiles.length,
      deletedMessages: oldMessages.length,
      deletedFeedItems: oldFeedItems.length,
    }
  },
})
