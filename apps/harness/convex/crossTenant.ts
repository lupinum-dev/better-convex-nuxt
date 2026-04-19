/**
 * Tenant-isolation integration surface.
 *
 * These handlers exist to exercise three distinct trust levels that
 * `defineTrellis` exposes on `ctx.db`:
 *
 * - `ctx.db`              — default; RLS + tenantIsolation enforced. Writes
 *                           and reads for other tenants are blocked.
 * - `ctx.db.crossTenant`  — bypasses tenant isolation only. Service rules
 *                           and triggers still apply. Must emit
 *                           `db.cross_tenant.used` on use.
 * - `ctx.db.raw`          — full escape hatch. No RLS, no service scope,
 *                           no triggers. Must emit `db.raw.used` on use.
 *
 * The `posts` table in this harness is configured to participate in
 * tenant isolation via `organizationId` (see ./functions.ts). Tests in
 * `crossTenant.test.ts` exercise these handlers to prove runtime
 * enforcement and observability emission.
 */
import { defineArgs } from '@lupinum/trellis/args'
import { defineGuard } from '@lupinum/trellis/auth'
import { v } from 'convex/values'

import type { Actor } from './auth/actor'
import { query } from './functions'

const authed = defineGuard<Actor>('Authenticated', (actor) => !!actor)

const getPostArgs = defineArgs({
  args: {
    id: v.id('posts'),
  },
})

/**
 * Read a post across tenants using the explicit `ctx.db.crossTenant` seam.
 *
 * In contrast to `posts.get`, this handler does not manually check
 * `actor.tenantId === post.organizationId`. The runtime's cross-tenant
 * db exposes the post regardless of the actor's tenant.
 */
export const getAnyPost = query({
  args: getPostArgs.args,
  guard: authed,
  handler: async (ctx, args) => {
    return await ctx.db.crossTenant.get(args.id)
  },
})

/**
 * List all posts across all tenants using `ctx.db.crossTenant`.
 */
export const listAllPosts = query({
  args: {},
  guard: authed,
  handler: async (ctx) => {
    return await ctx.db.crossTenant.query('posts').collect()
  },
})

/**
 * Read a post using the full `ctx.db.raw` escape hatch.
 */
export const getAnyPostRaw = query({
  args: getPostArgs.args,
  guard: authed,
  handler: async (ctx, args) => {
    return await ctx.db.raw.get(args.id)
  },
})
