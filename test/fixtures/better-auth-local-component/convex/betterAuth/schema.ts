import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export const tables = {
  user: defineTable({
    name: v.string(),
    email: v.optional(v.union(v.null(), v.string())),
    emailVerified: v.boolean(),
    image: v.optional(v.union(v.null(), v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
    role: v.optional(v.union(v.null(), v.string())),
    banned: v.optional(v.union(v.null(), v.boolean())),
    banReason: v.optional(v.union(v.null(), v.string())),
    banExpires: v.optional(v.union(v.null(), v.number())),
  })
    .index('email_name', ['email', 'name'])
    .index('name', ['name']),

  session: defineTable({
    userId: v.string(),
    expiresAt: v.number(),
    token: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    ipAddress: v.optional(v.union(v.null(), v.string())),
    userAgent: v.optional(v.union(v.null(), v.string())),
    activeOrganizationId: v.optional(v.union(v.null(), v.string())),
  })
    .index('expiresAt', ['expiresAt'])
    .index('expiresAt_userId', ['expiresAt', 'userId'])
    .index('token', ['token'])
    .index('userId', ['userId']),

  account: defineTable({
    userId: v.string(),
    accountId: v.string(),
    providerId: v.string(),
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
    createdAt: v.optional(v.union(v.null(), v.number())),
    updatedAt: v.optional(v.union(v.null(), v.number())),
  })
    .index('expiresAt', ['expiresAt'])
    .index('identifier', ['identifier']),

  organization: defineTable({
    name: v.string(),
    slug: v.string(),
    logo: v.optional(v.union(v.null(), v.string())),
    metadata: v.optional(v.union(v.null(), v.string())),
    createdAt: v.number(),
    updatedAt: v.optional(v.union(v.null(), v.number())),
  })
    .index('name', ['name'])
    .index('slug', ['slug']),

  member: defineTable({
    organizationId: v.string(),
    userId: v.string(),
    role: v.string(),
    createdAt: v.number(),
    updatedAt: v.optional(v.union(v.null(), v.number())),
  })
    .index('organizationId', ['organizationId'])
    .index('userId', ['userId']),

  invitation: defineTable({
    email: v.optional(v.union(v.null(), v.string())),
    role: v.optional(v.union(v.null(), v.string())),
    status: v.optional(v.union(v.null(), v.string())),
    organizationId: v.optional(v.union(v.null(), v.string())),
    inviterId: v.optional(v.union(v.null(), v.string())),
    expiresAt: v.optional(v.union(v.null(), v.number())),
    createdAt: v.optional(v.union(v.null(), v.number())),
    updatedAt: v.optional(v.union(v.null(), v.number())),
  })
    .index('email', ['email'])
    .index('organizationId', ['organizationId']),

  apikey: defineTable({
    name: v.optional(v.union(v.null(), v.string())),
    start: v.optional(v.union(v.null(), v.string())),
    prefix: v.optional(v.union(v.null(), v.string())),
    key: v.string(),
    userId: v.string(),
    refillInterval: v.optional(v.union(v.null(), v.number())),
    refillAmount: v.optional(v.union(v.null(), v.number())),
    lastRefillAt: v.optional(v.union(v.null(), v.number())),
    enabled: v.optional(v.union(v.null(), v.boolean())),
    rateLimitEnabled: v.optional(v.union(v.null(), v.boolean())),
    rateLimitTimeWindow: v.optional(v.union(v.null(), v.number())),
    rateLimitMax: v.optional(v.union(v.null(), v.number())),
    requestCount: v.optional(v.union(v.null(), v.number())),
    remaining: v.optional(v.union(v.null(), v.number())),
    lastRequest: v.optional(v.union(v.null(), v.number())),
    expiresAt: v.optional(v.union(v.null(), v.number())),
    createdAt: v.number(),
    updatedAt: v.number(),
    permissions: v.optional(v.union(v.null(), v.string())),
    metadata: v.optional(v.union(v.null(), v.string())),
  })
    .index('key', ['key'])
    .index('prefix', ['prefix'])
    .index('userId', ['userId']),
}

const schema = defineSchema(tables)

export default schema
