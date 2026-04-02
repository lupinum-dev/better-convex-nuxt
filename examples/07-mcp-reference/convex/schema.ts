import { literals } from 'convex-helpers/validators'
/**
 * Why this file exists:
 * Example 07 is the full MCP reference app. The schema keeps the business domain deliberately
 * small so the MCP behavior stays readable:
 * - workspaces: tenant boundary
 * - users: browser-auth actor rows
 * - runbooks: public + workspace + draft content used by MCP tools/resources/prompts
 * - mcpKeys: hashed bearer tokens for MCP clients
 */
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

const roleValidator = literals('owner', 'admin', 'member', 'viewer')

const visibilityValidator = literals('public', 'workspace', 'draft')

const keyStatusValidator = literals('active', 'revoked')

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

  runbooks: defineTable({
    title: v.string(),
    summary: v.string(),
    content: v.string(),
    visibility: visibilityValidator,
    tags: v.array(v.string()),
    ownerId: v.string(),
    workspaceId: v.id('workspaces'),
    createdAt: v.number(),
    updatedAt: v.number(),
    publishedAt: v.optional(v.number()),
  })
    .index('by_workspace', ['workspaceId'])
    .index('by_visibility', ['visibility'])
    .index('by_workspace_visibility', ['workspaceId', 'visibility'])
    .index('by_owner', ['ownerId']),

  mcpKeys: defineTable({
    name: v.string(),
    prefix: v.string(),
    hash: v.string(),
    boundAuthId: v.string(),
    boundWorkspaceId: v.id('workspaces'),
    issuedByAuthId: v.string(),
    status: keyStatusValidator,
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index('by_bound_workspace', ['boundWorkspaceId'])
    .index('by_hash', ['hash']),
})
