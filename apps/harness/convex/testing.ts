import { sha256 } from '@noble/hashes/sha2.js'
import { v } from 'convex/values'

import { components } from './_generated/api'
import { mutation, query } from './_generated/server'

const ALL_TABLES = [
  'organizations',
  'users',
  'posts',
  'comments',
  'tasks',
  'notes',
  'mcpKeys',
  'destructiveConfirmations',
  'destructiveAuditLog',
] as const

const BETTER_AUTH_TABLES = [
  'user',
  'session',
  'account',
  'verification',
  'twoFactor',
  'passkey',
  'oauthApplication',
  'oauthAccessToken',
  'oauthConsent',
  'jwks',
  'rateLimit',
] as const

function assertTestResetEnabled(confirmationCode: string, expectedCode: string, label: string) {
  if (confirmationCode !== expectedCode) {
    throw new Error(
      `[testing.${label}] Invalid confirmation code. ` + `Pass confirmationCode: "${expectedCode}"`,
    )
  }
}

function hashKey(key: string): string {
  const bytes = sha256(new TextEncoder().encode(key))
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
}

const MCP_VERIFICATION_KEYS = {
  admin: 'mcp_admin_verify_key_0000000000000001',
  member: 'mcp_member_verify_key_0000000000000001',
  viewer: 'mcp_viewer_verify_key_0000000000000001',
  noOrg: 'mcp_noorg_verify_key_00000000000000001',
  revoked: 'mcp_revoked_verify_key_0000000000000001',
} as const

export const clearAllData = mutation({
  args: {
    confirmationCode: v.string(),
  },
  handler: async (ctx, args) => {
    assertTestResetEnabled(args.confirmationCode, 'RESET_DB_FOR_TESTS', 'clearAllData')

    const stats: Record<string, number> = {}

    for (const table of ALL_TABLES) {
      const docs = (await ctx.db.query(table as never).collect()) as Array<{ _id: unknown }>
      stats[table] = docs.length

      for (const doc of docs) {
        await ctx.db.delete(doc._id as never)
      }
    }

    const authStats: Record<string, number> = {}
    for (const table of BETTER_AUTH_TABLES) {
      try {
        let totalDeleted = 0
        let hasMore = true

        while (hasMore) {
          const result = await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
            input: { model: table, where: [] },
            paginationOpts: { numItems: 100, cursor: null },
          } as never)
          totalDeleted += result.count
          hasMore = !result.isDone
        }

        authStats[`auth:${table}`] = totalDeleted
      } catch (error) {
        void error
      }
    }

    const allStats = { ...stats, ...authStats }

    return {
      success: true,
      deleted: allStats,
      totalDeleted: Object.values(allStats).reduce((a, b) => a + b, 0),
    }
  },
})

export const seedMcpVerification = mutation({
  args: {
    confirmationCode: v.string(),
  },
  handler: async (ctx, args) => {
    assertTestResetEnabled(args.confirmationCode, 'SEED_MCP_VERIFICATION', 'seedMcpVerification')

    const now = Date.now()
    const userRecords = {
      admin: {
        authKey: 'mcp-admin-user',
        role: 'admin' as const,
        displayName: 'MCP Admin',
        email: 'admin+mcp@test.local',
      },
      member: {
        authKey: 'mcp-member-user',
        role: 'member' as const,
        displayName: 'MCP Member',
        email: 'member+mcp@test.local',
      },
      viewer: {
        authKey: 'mcp-viewer-user',
        role: 'viewer' as const,
        displayName: 'MCP Viewer',
        email: 'viewer+mcp@test.local',
      },
      noOrg: {
        authKey: 'mcp-no-org-user',
        role: 'member' as const,
        displayName: 'MCP No Org',
        email: 'no-org+mcp@test.local',
      },
    }

    const userIds = {
      admin: await ctx.db.insert('users', {
        ...userRecords.admin,
        createdAt: now,
        updatedAt: now,
      }),
      member: await ctx.db.insert('users', {
        ...userRecords.member,
        createdAt: now,
        updatedAt: now,
      }),
      viewer: await ctx.db.insert('users', {
        ...userRecords.viewer,
        createdAt: now,
        updatedAt: now,
      }),
      noOrg: await ctx.db.insert('users', {
        ...userRecords.noOrg,
        createdAt: now,
        updatedAt: now,
      }),
    }

    const organizationId = await ctx.db.insert('organizations', {
      name: 'MCP Verification Org',
      slug: `mcp-verify-${now}`,
      ownerId: userIds.admin,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.patch(userIds.admin, { organizationId, updatedAt: now })
    await ctx.db.patch(userIds.member, { organizationId, updatedAt: now })
    await ctx.db.patch(userIds.viewer, { organizationId, updatedAt: now })

    const noteId = await ctx.db.insert('notes', {
      title: 'Seed note',
      content: 'Created by testing.seedMcpVerification',
      createdAt: now,
      userId: userIds.member,
    })

    const postId = await ctx.db.insert('posts', {
      title: 'Seed post',
      content: 'Created by testing.seedMcpVerification',
      status: 'draft',
      ownerId: userIds.member,
      organizationId,
      createdAt: now,
      updatedAt: now,
    })

    const keyDocs = {
      admin: {
        name: 'Admin verification key',
        keyHash: hashKey(MCP_VERIFICATION_KEYS.admin),
        prefix: 'mcp_admin_ve...',
        role: 'admin' as const,
        userId: userIds.admin,
        organizationId,
        status: 'active' as const,
        createdAt: now,
      },
      member: {
        name: 'Member verification key',
        keyHash: hashKey(MCP_VERIFICATION_KEYS.member),
        prefix: 'mcp_member_v...',
        role: 'member' as const,
        userId: userIds.member,
        organizationId,
        status: 'active' as const,
        createdAt: now,
      },
      viewer: {
        name: 'Viewer verification key',
        keyHash: hashKey(MCP_VERIFICATION_KEYS.viewer),
        prefix: 'mcp_viewer_v...',
        role: 'viewer' as const,
        userId: userIds.viewer,
        organizationId,
        status: 'active' as const,
        createdAt: now,
      },
      noOrg: {
        name: 'No-org verification key',
        keyHash: hashKey(MCP_VERIFICATION_KEYS.noOrg),
        prefix: 'mcp_noorg_ve...',
        role: 'member' as const,
        userId: userIds.noOrg,
        status: 'active' as const,
        createdAt: now,
      },
      revoked: {
        name: 'Revoked verification key',
        keyHash: hashKey(MCP_VERIFICATION_KEYS.revoked),
        prefix: 'mcp_revoked_...',
        role: 'member' as const,
        userId: userIds.member,
        organizationId,
        status: 'revoked' as const,
        createdAt: now,
        revokedAt: now,
      },
    }

    const keyIds = {
      admin: await ctx.db.insert('mcpKeys', keyDocs.admin),
      member: await ctx.db.insert('mcpKeys', keyDocs.member),
      viewer: await ctx.db.insert('mcpKeys', keyDocs.viewer),
      noOrg: await ctx.db.insert('mcpKeys', keyDocs.noOrg),
      revoked: await ctx.db.insert('mcpKeys', keyDocs.revoked),
    }

    return {
      organizationId,
      users: {
        admin: { id: userIds.admin, authKey: userRecords.admin.authKey },
        member: { id: userIds.member, authKey: userRecords.member.authKey },
        viewer: { id: userIds.viewer, authKey: userRecords.viewer.authKey },
        noOrg: { id: userIds.noOrg, authKey: userRecords.noOrg.authKey },
      },
      resources: {
        noteId,
        postId,
      },
      keys: {
        admin: { id: keyIds.admin, key: MCP_VERIFICATION_KEYS.admin },
        member: { id: keyIds.member, key: MCP_VERIFICATION_KEYS.member },
        viewer: { id: keyIds.viewer, key: MCP_VERIFICATION_KEYS.viewer },
        noOrg: { id: keyIds.noOrg, key: MCP_VERIFICATION_KEYS.noOrg },
        revoked: { id: keyIds.revoked, key: MCP_VERIFICATION_KEYS.revoked },
      },
    }
  },
})

export const getMcpVerificationState = query({
  args: {
    confirmationCode: v.string(),
  },
  handler: async (ctx, args) => {
    assertTestResetEnabled(
      args.confirmationCode,
      'READ_MCP_VERIFICATION',
      'getMcpVerificationState',
    )

    const keys = await ctx.db.query('mcpKeys').collect()
    const confirmations = await ctx.db.query('destructiveConfirmations' as never).collect()
    const audit = await ctx.db.query('destructiveAuditLog' as never).collect()
    return { keys, confirmations, audit }
  },
})
