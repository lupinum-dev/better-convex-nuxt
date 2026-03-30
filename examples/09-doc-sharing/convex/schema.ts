import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export const roleValidator = v.union(
  v.literal('owner'),
  v.literal('admin'),
  v.literal('member'),
  v.literal('viewer'),
)

export const accessLevelValidator = v.union(
  v.literal('view'),
  v.literal('comment'),
  v.literal('edit'),
)

export default defineSchema({
  workspaces: defineTable({
    name: v.string(),
    slug: v.string(),
    ownerId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_slug', ['slug']),

  users: defineTable({
    authId: v.string(),
    email: v.optional(v.string()),
    displayName: v.optional(v.string()),
    role: roleValidator,
    workspaceId: v.optional(v.id('workspaces')),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_auth_id', ['authId'])
    .index('by_email', ['email'])
    .index('by_workspace', ['workspaceId']),

  pages: defineTable({
    workspaceId: v.id('workspaces'),
    title: v.string(),
    body: v.string(),
    visibility: v.union(v.literal('private'), v.literal('workspace')),
    parentPageId: v.optional(v.id('pages')),
    ownerId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_workspace', ['workspaceId'])
    .index('by_parent', ['parentPageId']),

  pageShares: defineTable({
    workspaceId: v.id('workspaces'),
    pageId: v.id('pages'),
    userId: v.string(),
    level: accessLevelValidator,
    createdAt: v.number(),
  })
    .index('by_page', ['pageId'])
    .index('by_user_page', ['userId', 'pageId']),

  shareTokens: defineTable({
    workspaceId: v.id('workspaces'),
    pageId: v.id('pages'),
    token: v.string(),
    level: accessLevelValidator,
    expiresAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index('by_token', ['token']),
})
