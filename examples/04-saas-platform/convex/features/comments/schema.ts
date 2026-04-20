import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const commentTables = {
  comments: defineTable({
    workspaceId: v.id('workspaces'),
    taskId: v.id('tasks'),
    ownerId: v.string(),
    body: v.string(),
    attachmentStorageId: v.optional(v.id('_storage')),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_workspace', ['workspaceId'])
    .index('by_task', ['taskId'])
    .index('by_owner', ['ownerId']),
}
