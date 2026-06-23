/**
 * Minimal Better Auth schema for the current OAuth Provider proof.
 *
 * Keep this hard-cut to Better Auth core, Convex JWT, and
 * `@better-auth/oauth-provider@1.6.20`. Do not add deprecated
 * `oauthApplication` tables from the older `oidcProvider()` or `mcp()` plugins.
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

  jwks: defineTable({
    publicKey: v.string(),
    privateKey: v.string(),
    createdAt: v.number(),
    expiresAt: v.optional(v.union(v.null(), v.number())),
  }),

  oauthClient: defineTable({
    clientId: v.string(),
    clientSecret: v.optional(v.string()),
    disabled: v.optional(v.boolean()),
    skipConsent: v.optional(v.boolean()),
    enableEndSession: v.optional(v.boolean()),
    subjectType: v.optional(v.string()),
    scopes: v.optional(v.array(v.string())),
    userId: v.optional(v.string()),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
    name: v.optional(v.string()),
    uri: v.optional(v.string()),
    icon: v.optional(v.string()),
    contacts: v.optional(v.array(v.string())),
    tos: v.optional(v.string()),
    policy: v.optional(v.string()),
    softwareId: v.optional(v.string()),
    softwareVersion: v.optional(v.string()),
    softwareStatement: v.optional(v.string()),
    redirectUris: v.array(v.string()),
    postLogoutRedirectUris: v.optional(v.array(v.string())),
    tokenEndpointAuthMethod: v.optional(v.string()),
    grantTypes: v.optional(v.array(v.string())),
    responseTypes: v.optional(v.array(v.string())),
    public: v.optional(v.boolean()),
    type: v.optional(v.string()),
    requirePKCE: v.optional(v.boolean()),
    referenceId: v.optional(v.string()),
    metadata: v.optional(v.any()),
  })
    .index('clientId', ['clientId'])
    .index('userId', ['userId']),

  oauthRefreshToken: defineTable({
    token: v.string(),
    clientId: v.string(),
    sessionId: v.optional(v.string()),
    userId: v.string(),
    referenceId: v.optional(v.string()),
    expiresAt: v.number(),
    createdAt: v.number(),
    revoked: v.optional(v.union(v.null(), v.number())),
    authTime: v.optional(v.number()),
    scopes: v.array(v.string()),
  })
    .index('token', ['token'])
    .index('clientId', ['clientId'])
    .index('sessionId', ['sessionId'])
    .index('userId', ['userId']),

  oauthAccessToken: defineTable({
    token: v.string(),
    clientId: v.string(),
    sessionId: v.optional(v.string()),
    userId: v.optional(v.string()),
    referenceId: v.optional(v.string()),
    refreshId: v.optional(v.string()),
    expiresAt: v.number(),
    createdAt: v.number(),
    scopes: v.array(v.string()),
  })
    .index('token', ['token'])
    .index('clientId', ['clientId'])
    .index('sessionId', ['sessionId'])
    .index('userId', ['userId'])
    .index('refreshId', ['refreshId']),

  oauthConsent: defineTable({
    clientId: v.string(),
    userId: v.optional(v.string()),
    referenceId: v.optional(v.string()),
    scopes: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('clientId', ['clientId'])
    .index('clientId_userId', ['clientId', 'userId'])
    .index('userId', ['userId']),
}

export default defineSchema(tables)
