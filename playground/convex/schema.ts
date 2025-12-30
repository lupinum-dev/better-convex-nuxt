import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

// Role type for type-safe role validation
const roleValidator = v.union(
  v.literal('owner'),
  v.literal('admin'),
  v.literal('member'),
  v.literal('viewer'),
)

export default defineSchema({
  // ============================================
  // ORGANIZATIONS
  // ============================================
  organizations: defineTable({
    name: v.string(),
    slug: v.string(),

    // The user who created the org (authId)
    ownerId: v.string(),

    // Optional settings
    logoUrl: v.optional(v.string()),
    billingEmail: v.optional(v.string()),
    plan: v.optional(v.string()),

    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_slug', ['slug'])
    .index('by_owner', ['ownerId']),

  // ============================================
  // USERS
  // ============================================
  users: defineTable({
    // Auth provider ID (from Better Auth)
    authId: v.string(),

    // User info
    displayName: v.optional(v.string()),
    email: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),

    // Role within their organization
    role: roleValidator,

    // Organization membership (optional during onboarding)
    organizationId: v.optional(v.id('organizations')),

    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_auth_id', ['authId'])
    .index('by_organization', ['organizationId'])
    .index('by_email', ['email']),

  // ============================================
  // INVITES
  // ============================================
  invites: defineTable({
    email: v.string(),
    role: v.union(v.literal('admin'), v.literal('member'), v.literal('viewer')),
    organizationId: v.id('organizations'),
    invitedBy: v.string(), // authId
    status: v.union(
      v.literal('pending'),
      v.literal('accepted'),
      v.literal('revoked'),
      v.literal('expired'),
    ),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index('by_organization', ['organizationId'])
    .index('by_email', ['email'])
    .index('by_status', ['status']),

  // ============================================
  // POSTS (permission system demo)
  // ============================================
  posts: defineTable({
    title: v.string(),
    content: v.string(),
    status: v.union(v.literal('draft'), v.literal('published'), v.literal('archived')),

    // Ownership - required for permission checks
    ownerId: v.string(), // authId of creator
    organizationId: v.id('organizations'),

    // Optional metadata
    publishedAt: v.optional(v.number()),

    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_organization', ['organizationId'])
    .index('by_owner', ['ownerId'])
    .index('by_status', ['status']),

  // ============================================
  // COMMENTS (nested resource demo)
  // ============================================
  comments: defineTable({
    content: v.string(),
    postId: v.id('posts'),

    // Ownership
    ownerId: v.string(),
    organizationId: v.id('organizations'),

    // Edit tracking
    editedAt: v.optional(v.number()),

    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_post', ['postId'])
    .index('by_owner', ['ownerId'])
    .index('by_organization', ['organizationId']),

  // ============================================
  // TASKS (existing - unchanged)
  // ============================================
  tasks: defineTable({
    userId: v.string(), // Better Auth user ID
    title: v.string(),
    completed: v.boolean(),
    createdAt: v.number(),
  }).index('by_user', ['userId']),

  // ============================================
  // NOTES (existing - public demo)
  // ============================================
  notes: defineTable({
    title: v.optional(v.string()),
    content: v.string(),
    createdAt: v.number(),
    userId: v.optional(v.string()),
  }),
})
