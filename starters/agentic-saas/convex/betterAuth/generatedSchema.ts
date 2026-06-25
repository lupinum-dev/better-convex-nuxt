/**
 * Minimal Better Auth schema for the agentic SaaS proof.
 *
 * Keep this scoped to Better Auth core + Organization. Do not copy unrelated
 * plugin tables here unless the proof enables and tests the matching plugin.
 */

import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export const tables = {
  user: defineTable({
    name: v.string(),
    email: v.string(),
    emailVerified: v.boolean(),
    image: v.optional(v.union(v.null(), v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
    role: v.optional(v.union(v.null(), v.string())),
    banned: v.optional(v.union(v.null(), v.boolean())),
    banReason: v.optional(v.union(v.null(), v.string())),
    banExpires: v.optional(v.union(v.null(), v.number())),
  })
    .index('email', ['email'])
    .index('email_name', ['email', 'name'])
    .index('name', ['name']),

  session: defineTable({
    expiresAt: v.number(),
    token: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    ipAddress: v.optional(v.union(v.null(), v.string())),
    userAgent: v.optional(v.union(v.null(), v.string())),
    userId: v.string(),
    impersonatedBy: v.optional(v.union(v.null(), v.string())),
    activeOrganizationId: v.optional(v.union(v.null(), v.string())),
  })
    .index('expiresAt', ['expiresAt'])
    .index('expiresAt_userId', ['expiresAt', 'userId'])
    .index('token', ['token'])
    .index('userId', ['userId']),

  account: defineTable({
    accountId: v.string(),
    providerId: v.string(),
    userId: v.string(),
    accessToken: v.optional(v.union(v.null(), v.string())),
    refreshToken: v.optional(v.union(v.null(), v.string())),
    idToken: v.optional(v.union(v.null(), v.string())),
    accessTokenExpiresAt: v.optional(v.union(v.null(), v.number())),
    refreshTokenExpiresAt: v.optional(v.union(v.null(), v.number())),
    scope: v.optional(v.union(v.null(), v.string())),
    password: v.optional(v.union(v.null(), v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('accountId', ['accountId'])
    .index('accountId_providerId', ['accountId', 'providerId'])
    .index('providerId_userId', ['providerId', 'userId'])
    .index('userId', ['userId']),

  verification: defineTable({
    identifier: v.string(),
    value: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('expiresAt', ['expiresAt'])
    .index('identifier', ['identifier']),

  organization: defineTable({
    name: v.string(),
    slug: v.string(),
    logo: v.optional(v.union(v.null(), v.string())),
    metadata: v.optional(v.union(v.null(), v.string())),
    createdAt: v.number(),
  })
    .index('slug', ['slug'])
    .index('metadata', ['metadata']),

  organizationRole: defineTable({
    organizationId: v.string(),
    role: v.string(),
    permission: v.string(),
    createdAt: v.number(),
    updatedAt: v.optional(v.union(v.null(), v.number())),
  })
    .index('organizationId', ['organizationId'])
    .index('role', ['role']),

  member: defineTable({
    organizationId: v.string(),
    userId: v.string(),
    role: v.string(),
    createdAt: v.number(),
  })
    .index('organizationId', ['organizationId'])
    .index('userId', ['userId'])
    .index('role', ['role']),

  invitation: defineTable({
    organizationId: v.string(),
    email: v.string(),
    role: v.optional(v.union(v.null(), v.string())),
    status: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
    inviterId: v.string(),
  })
    .index('organizationId', ['organizationId'])
    .index('email', ['email'])
    .index('role', ['role'])
    .index('status', ['status'])
    .index('inviterId', ['inviterId']),

  jwks: defineTable({
    publicKey: v.string(),
    privateKey: v.string(),
    createdAt: v.number(),
  }),
}

export default defineSchema(tables)
