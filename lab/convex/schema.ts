import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

const roleValidator = v.union(
  v.literal('owner'),
  v.literal('admin'),
  v.literal('member'),
  v.literal('viewer')
)

export const roleValues = ['owner', 'admin', 'member', 'viewer'] as const
export type Role = (typeof roleValues)[number]

export default defineSchema({
  // ============================================
  // USERS - Simplified for Labs (no organizations)
  // ============================================
  users: defineTable({
    authId: v.string(),
    displayName: v.optional(v.string()),
    email: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    role: roleValidator,
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index('by_auth_id', ['authId'])
    .index('by_email', ['email']),

  // ============================================
  // FEED ITEMS - Real-time demo
  // ============================================
  feedItems: defineTable({
    content: v.string(),
    type: v.union(v.literal('message'), v.literal('task'), v.literal('event')),
    authorId: v.string(),
    authorName: v.optional(v.string()),
    createdAt: v.number()
  }).index('by_created', ['createdAt']),

  // ============================================
  // DEMO TASKS - Optimistic updates demo
  // ============================================
  demoTasks: defineTable({
    title: v.string(),
    completed: v.boolean(),
    userId: v.string(),
    createdAt: v.number()
  }).index('by_user', ['userId']),

  // ============================================
  // MESSAGES - Pagination demo
  // ============================================
  messages: defineTable({
    content: v.string(),
    authorId: v.string(),
    authorName: v.optional(v.string()),
    createdAt: v.number()
  }).index('by_created', ['createdAt']),

  // ============================================
  // FILES - Storage demo
  // ============================================
  files: defineTable({
    storageId: v.id('_storage'),
    filename: v.string(),
    mimeType: v.string(),
    size: v.number(),
    uploadedBy: v.string(),
    createdAt: v.number()
  })
    .index('by_uploaded_by', ['uploadedBy'])
    .index('by_created', ['createdAt'])
})
