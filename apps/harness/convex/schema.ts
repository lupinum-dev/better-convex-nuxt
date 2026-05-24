import { literals } from 'convex-helpers/validators'
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

// Role type for type-safe role validation
const roleValidator = literals('owner', 'admin', 'member', 'viewer')

export default defineSchema({
  // ============================================
  // ORGANIZATIONS
  // ============================================
  organizations: defineTable({
    name: v.string(),
    slug: v.string(),

    // The local app user who created the org.
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
    authKey: v.string(),

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
    .index('by_auth_key', ['authKey'])
    .index('by_organization', ['organizationId'])
    .index('by_email', ['email']),

  // ============================================
  // POSTS (permission system demo)
  // ============================================
  posts: defineTable({
    title: v.string(),
    content: v.string(),
    status: literals('draft', 'published', 'archived'),

    // Ownership - required for permission checks
    ownerId: v.string(), // local users._id of creator
    organizationId: v.id('organizations'),

    // Optional metadata
    publishedAt: v.optional(v.number()),

    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_organization', ['organizationId'])
    .index('by_org_status', ['organizationId', 'status'])
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
    userId: v.string(), // local users._id
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

  // ============================================
  // MCP KEYS (API key management)
  // ============================================
  mcpKeys: defineTable({
    // Human-readable name for the key
    name: v.string(),

    // The secret key is hashed at rest; only the prefix is stored for display.
    keyHash: v.string(),
    prefix: v.string(), // First 8 chars for display: "mcp_abc1..."

    // Identity bound to this key
    role: roleValidator,
    userId: v.string(), // local users._id of the user who created the key
    organizationId: v.optional(v.id('organizations')),

    // Status
    status: literals('active', 'revoked'),
    lastUsedAt: v.optional(v.number()),

    // Timestamps
    createdAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index('by_key_hash', ['keyHash'])
    .index('by_user', ['userId'])
    .index('by_organization', ['organizationId']),

  destructiveConfirmations: defineTable({
    tokenHash: v.string(),
    jti: v.string(),
    operationId: v.string(),
    executePath: v.string(),
    previewPath: v.string(),
    callerKey: v.string(),
    scopeKey: v.string(),
    argsHash: v.string(),
    argsFieldHashes: v.optional(v.record(v.string(), v.string())),
    previewHash: v.string(),
    versionHash: v.optional(v.string()),
    createdAt: v.number(),
    expiresAt: v.number(),
    redeemedAt: v.optional(v.number()),
  })
    .index('by_token_hash', ['tokenHash'])
    .index('by_jti', ['jti'])
    .index('by_expires_at', ['expiresAt']),

  destructiveAuditLog: defineTable({
    operationId: v.string(),
    jti: v.string(),
    callerKey: v.string(),
    scopeKey: v.string(),
    argsHash: v.string(),
    previewHash: v.string(),
    executedAt: v.number(),
    executePath: v.string(),
  }),

  // ============================================
  // EXPERIMENT TABLES (trellis-testing branch)
  // ============================================
  expTriggerLog: defineTable({
    table: v.string(),
    operation: v.string(),
    docId: v.string(),
    door: v.string(),
    timestamp: v.number(),
  }),

  expJtiLog: defineTable({
    jti: v.string(),
    redeemedAt: v.number(),
  }).index('by_jti', ['jti']),

  expAuditLog: defineTable({
    operation: v.string(),
    callerKey: v.string(),
    argsHash: v.string(),
    previewHash: v.optional(v.string()),
    timestamp: v.number(),
  }),

  // ---------- Experiment 13: per-table scope ----------
  // Workspaces are themselves scoped by organizationId (parent scope).
  expWorkspaces: defineTable({
    name: v.string(),
    organizationId: v.id('organizations'),
    createdAt: v.number(),
  })
    .index('by_organization', ['organizationId'])
    .index('by_org_name', ['organizationId', 'name']),

  // Documents are scoped by workspaceId (child scope, different field).
  expDocuments: defineTable({
    title: v.string(),
    status: v.string(),
    workspaceId: v.id('expWorkspaces'),
    createdAt: v.number(),
  })
    .index('by_workspace', ['workspaceId'])
    .index('by_workspace_status', ['workspaceId', 'status']),

  // ---------- Experiment 14: runAsUser audit ----------
  // Reuses expAuditLog above.

  // ---------- Experiment 15: operations-as-objects ----------
  expRunbooks: defineTable({
    title: v.string(),
    archived: v.boolean(),
    organizationId: v.id('organizations'),
  }).index('by_organization', ['organizationId']),
})
