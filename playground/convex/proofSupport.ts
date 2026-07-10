import { paginationOptsValidator } from 'convex/server'
/**
 * Proof Support Functions (vNext Phase 0 harness)
 *
 * Minimal Convex functions used ONLY by the pre-implementation proof suite
 * (test/proofs/**) to exercise auth identity propagation, error contracts,
 * and subscription/optimistic-update wire behavior against a real deployment.
 *
 * Not part of the product surface. Do not import from app code.
 * See /private/tmp/.../scratchpad/proofs-harness.md for the harness contract.
 */
import { ConvexError, v } from 'convex/values'

import { mutation, query } from './_generated/server'

// ============================================
// (a) Identity echo — returns the caller's identity subject, or null.
// ============================================
export const identityEcho = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null
    return {
      subject: identity.subject,
      tokenIdentifier: identity.tokenIdentifier,
      email: identity.email ?? null,
      name: identity.name ?? null,
    }
  },
})

// ============================================
// (b) Failing query — always throws a structured ConvexError.
// ============================================
export const failingQuery = query({
  args: {},
  handler: async () => {
    throw new ConvexError({ code: 'PROOF', secretMarker: 'none' })
  },
})

// ============================================
// (c) Tiny counter — for subscription / optimistic-update / wire fixtures.
// ============================================
export const incrementCounter = mutation({
  args: { key: v.string(), by: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const delta = args.by ?? 1
    const existing = await ctx.db
      .query('proofCounters')
      .withIndex('by_key', (q) => q.eq('key', args.key))
      .first()

    const now = Date.now()
    let nextValue: number

    if (existing) {
      nextValue = existing.value + delta
      await ctx.db.patch(existing._id, { value: nextValue, updatedAt: now })
    } else {
      nextValue = delta
      await ctx.db.insert('proofCounters', { key: args.key, value: nextValue, updatedAt: now })
    }

    await ctx.db.insert('proofCounterEvents', { key: args.key, value: nextValue, createdAt: now })

    return nextValue
  },
})

export const getCounter = query({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('proofCounters')
      .withIndex('by_key', (q) => q.eq('key', args.key))
      .first()
    return existing?.value ?? 0
  },
})

// ============================================
// (d) Paginated counter events — for pagination-shaped fixtures.
// ============================================
export const listCounterEvents = query({
  args: { key: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('proofCounterEvents')
      .withIndex('by_key', (q) => q.eq('key', args.key))
      .order('desc')
      .paginate(args.paginationOpts)
  },
})
