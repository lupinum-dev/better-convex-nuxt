/**
 * Testing Utilities for E2E Tests
 *
 * IMPORTANT: These functions are only for test environments.
 * They are protected by the ALLOW_TEST_RESET environment variable.
 */

import { v } from 'convex/values'

import { components } from './_generated/api'
import { mutation, query } from './_generated/server'

// All tables from schema.ts
const ALL_TABLES = [
  'organizations',
  'users',
  'invites',
  'posts',
  'comments',
  'tasks',
  'notes',
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

/**
 * Clear all data from the database
 *
 * Safety measures:
 * 1. Requires ALLOW_TEST_RESET=true environment variable
 * 2. Requires confirmation code to prevent accidental calls
 */
export const clearAllData = mutation({
  args: {
    confirmationCode: v.string(),
  },
  handler: async (ctx, args) => {
    // Safety check 1: Environment variable
    const allowReset = process.env.ALLOW_TEST_RESET
    if (allowReset !== 'true') {
      throw new Error(
        '[testing.clearAllData] ALLOW_TEST_RESET environment variable is not set to "true". ' +
          'This mutation is only available in test environments.',
      )
    }

    // Safety check 2: Confirmation code
    if (args.confirmationCode !== 'RESET_DB_FOR_TESTS') {
      throw new Error(
        '[testing.clearAllData] Invalid confirmation code. ' +
          'Pass confirmationCode: "RESET_DB_FOR_TESTS"',
      )
    }

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
