/**
 * Testing Utilities for E2E Tests
 *
 * IMPORTANT: These functions are only for local playground verification.
 * Local Convex dev does not reliably surface arbitrary env vars inside
 * function runtimes, so test reset is hard-enabled here for now.
 */

import { v } from 'convex/values'

import { components } from './_generated/api'
import { action, internalQuery, mutation, query } from './_generated/server'

// All tables from schema.ts
const ALL_TABLES = [
  'organizations',
  'users',
  'invites',
  'posts',
  'comments',
  'tasks',
  'notes',
  'mcpKeys',
] as const

// Better Auth component tables
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
      `[testing.${label}] Invalid confirmation code. `
      + `Pass confirmationCode: "${expectedCode}"`,
    )
  }
}

/**
 * Clear all data from the database
 *
 * Safety measure:
 * Requires a confirmation code to prevent accidental calls.
 */
export const clearAllData = mutation({
  args: {
    confirmationCode: v.string(),
  },
  handler: async (ctx, args) => {
    assertTestResetEnabled(args.confirmationCode, 'RESET_DB_FOR_TESTS', 'clearAllData')

    // Clear all app tables
    const stats: Record<string, number> = {}

    for (const table of ALL_TABLES) {
      const docs = await ctx.db.query(table).collect()
      stats[table] = docs.length

      for (const doc of docs) {
        await ctx.db.delete(doc._id)
      }
    }

    // Clear Better Auth component tables
    const authStats: Record<string, number> = {}
    for (const table of BETTER_AUTH_TABLES) {
      try {
        // Delete all documents using pagination loop
        let totalDeleted = 0
        let hasMore = true

        while (hasMore) {
          const result = await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
            input: { model: table, where: [] },
            paginationOpts: { numItems: 100, cursor: null },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Better Auth component typing
          } as any)
          totalDeleted += result.count
          hasMore = !result.isDone
        }

        authStats[`auth:${table}`] = totalDeleted
      } catch (error) {
        // Table might not exist or be empty, continue
        console.log(`[testing.clearAllData] Could not clear auth table ${table}:`, error)
      }
    }

    const allStats = { ...stats, ...authStats }
    console.log('[testing.clearAllData] Cleared database:', allStats)

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
    assertTestResetEnabled(
      args.confirmationCode,
      'SEED_MCP_VERIFICATION',
      'seedMcpVerification',
    )

    const now = Date.now()
    const organizationId = await ctx.db.insert('organizations', {
      name: 'MCP Verification Org',
      slug: `mcp-verify-${now}`,
      ownerId: 'mcp-admin-user',
      createdAt: now,
      updatedAt: now,
    })

    const userRecords = {
      admin: {
        authId: 'mcp-admin-user',
        role: 'admin' as const,
        displayName: 'MCP Admin',
        email: 'admin+mcp@test.local',
        organizationId,
      },
      member: {
        authId: 'mcp-member-user',
        role: 'member' as const,
        displayName: 'MCP Member',
        email: 'member+mcp@test.local',
        organizationId,
      },
      viewer: {
        authId: 'mcp-viewer-user',
        role: 'viewer' as const,
        displayName: 'MCP Viewer',
        email: 'viewer+mcp@test.local',
        organizationId,
      },
      noOrg: {
        authId: 'mcp-no-org-user',
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

    const noteId = await ctx.db.insert('notes', {
      title: 'Seed note',
      content: 'Created by testing.seedMcpVerification',
      createdAt: now,
      userId: userRecords.member.authId,
    })

    const taskId = await ctx.db.insert('tasks', {
      userId: userRecords.member.authId,
      title: 'Seed task',
      completed: false,
      createdAt: now,
    })

    const postId = await ctx.db.insert('posts', {
      title: 'Seed post',
      content: 'Created by testing.seedMcpVerification',
      status: 'draft',
      ownerId: userRecords.member.authId,
      organizationId,
      createdAt: now,
      updatedAt: now,
    })

    const commentId = await ctx.db.insert('comments', {
      postId,
      content: 'Seed comment',
      ownerId: userRecords.member.authId,
      organizationId,
      createdAt: now,
      updatedAt: now,
    })

    const keyDocs = {
      admin: {
        name: 'Admin verification key',
        key: 'mcp_admin_verify_key_0000000000000001',
        prefix: 'mcp_admin_ve...',
        role: 'admin' as const,
        userId: userRecords.admin.authId,
        organizationId,
        status: 'active' as const,
        createdAt: now,
      },
      member: {
        name: 'Member verification key',
        key: 'mcp_member_verify_key_0000000000000001',
        prefix: 'mcp_member_v...',
        role: 'member' as const,
        userId: userRecords.member.authId,
        organizationId,
        status: 'active' as const,
        createdAt: now,
      },
      viewer: {
        name: 'Viewer verification key',
        key: 'mcp_viewer_verify_key_0000000000000001',
        prefix: 'mcp_viewer_v...',
        role: 'viewer' as const,
        userId: userRecords.viewer.authId,
        organizationId,
        status: 'active' as const,
        createdAt: now,
      },
      noOrg: {
        name: 'No-org verification key',
        key: 'mcp_noorg_verify_key_00000000000000001',
        prefix: 'mcp_noorg_ve...',
        role: 'member' as const,
        userId: userRecords.noOrg.authId,
        status: 'active' as const,
        createdAt: now,
      },
      revoked: {
        name: 'Revoked verification key',
        key: 'mcp_revoked_verify_key_0000000000000001',
        prefix: 'mcp_revoked_...',
        role: 'member' as const,
        userId: userRecords.member.authId,
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
        admin: { id: userIds.admin, authId: userRecords.admin.authId },
        member: { id: userIds.member, authId: userRecords.member.authId },
        viewer: { id: userIds.viewer, authId: userRecords.viewer.authId },
        noOrg: { id: userIds.noOrg, authId: userRecords.noOrg.authId },
      },
      resources: {
        noteId,
        taskId,
        postId,
        commentId,
      },
      keys: {
        admin: { id: keyIds.admin, key: keyDocs.admin.key },
        member: { id: keyIds.member, key: keyDocs.member.key },
        viewer: { id: keyIds.viewer, key: keyDocs.viewer.key },
        noOrg: { id: keyIds.noOrg, key: keyDocs.noOrg.key },
        revoked: { id: keyIds.revoked, key: keyDocs.revoked.key },
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
    const posts = await ctx.db.query('posts').collect()
    const comments = await ctx.db.query('comments').collect()
    const notes = await ctx.db.query('notes').collect()
    const tasks = await ctx.db.query('tasks').collect()

    return {
      keys,
      counts: {
        notes: notes.length,
        tasks: tasks.length,
        posts: posts.length,
        comments: comments.length,
      },
    }
  },
})

/**
 * Health check query - verifies database connection
 */
export const healthCheck = query({
  args: {},
  handler: async () => {
    return {
      ok: true,
      timestamp: Date.now(),
    }
  },
})

/**
 * Query that always fails - for testing error handling
 */
export const alwaysFails = query({
  args: {},
  handler: async () => {
    throw new Error('Intentional test error for E2E testing')
  },
})

/**
 * Mutation that always fails - for testing mutation error handling
 */
export const alwaysFailsMutation = mutation({
  args: {},
  handler: async () => {
    throw new Error('Intentional mutation error for E2E testing')
  },
})

/**
 * Internal query for the test action to call
 */
export const getHealthData = internalQuery({
  args: {},
  handler: async () => {
    return {
      serverTime: Date.now(),
      status: 'healthy',
    }
  },
})

/**
 * Simple test action - for testing useConvexAction
 * Returns the input value after a small delay (simulates work)
 */
export const echo = action({
  args: { message: v.string() },
  handler: async (_ctx, args) => {
    // Simulate some async work
    await new Promise((resolve) => setTimeout(resolve, 100))
    return {
      echoed: args.message,
      timestamp: Date.now(),
    }
  },
})

/**
 * Action that always fails - for testing action error handling
 */
export const alwaysFailsAction = action({
  args: {},
  handler: async () => {
    throw new Error('Intentional action error for E2E testing')
  },
})
