/**
 * Testing Utilities for E2E Tests
 *
 * These functions exercise public query, mutation, and action error handling.
 */

import { v } from 'convex/values'

import { action, mutation, query } from './_generated/server'

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
 * Simple test action - for testing useConvexAction
 * Returns the input value after a small delay (simulates work)
 */
export const echo = action({
  args: { message: v.string() },
  handler: async (_ctx, args) => {
    const message = args.message.trim()
    if (!message || message.length > 5_000) {
      throw new Error('Message must be between 1 and 5000 characters')
    }
    // Simulate some async work
    await new Promise((resolve) => setTimeout(resolve, 100))
    return {
      echoed: message,
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
