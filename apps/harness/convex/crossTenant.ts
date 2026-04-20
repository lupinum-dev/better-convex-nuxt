/**
 * Tenant-isolation integration surface.
 *
 * These handlers exist to exercise three distinct trust levels that
 * `defineTrellis` exposes on `ctx.db`:
 *
 * - `ctx.db`              — default; RLS + tenantIsolation enforced. Writes
 *                           and reads for other tenants are blocked.
 * - `ctx.db.escapeTenantIsolation({ reason })`
 *                         — bypasses tenant isolation only. Service rules
 *                           and triggers still apply. Must emit
 *                           `db.escape_tenant_isolation.used` on use.
 * - `unsafe.query(...)`   — full escape hatch. No protected handler pipeline.
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
import { query, unsafe } from './functions'

const authed = defineGuard<Actor>('Authenticated', (actor) => !!actor)

const getPostArgs = defineArgs({
  args: {
    id: v.id('posts'),
  },
})

/**
 * Read a post across tenants using the explicit tenant-isolation escape seam.
 *
 * In contrast to `posts.get`, this handler does not manually check
 * `actor.tenantId === post.organizationId`. The runtime's cross-tenant
 * db exposes the post regardless of the actor's tenant.
 */
export const getAnyPost = query({
  args: getPostArgs.args,
  guard: authed,
  handler: async (ctx, args) => {
    return await ctx.db
      .escapeTenantIsolation({ reason: 'Harness cross-tenant post lookup.' })
      .get(args.id)
  },
})

/**
 * List all posts across all tenants using `ctx.db.escapeTenantIsolation({ reason })`.
 */
export const listAllPosts = query({
  args: {},
  guard: authed,
  handler: async (ctx) => {
    return await ctx.db
      .escapeTenantIsolation({ reason: 'Harness cross-tenant post listing.' })
      .query('posts')
      .collect()
  },
})

/**
 * Read a post using the full builder-level `unsafe.query(...)` escape hatch.
 */
export const getAnyPostRaw = unsafe.query({
  bypass: 'Harness full-bypass post lookup.',
  args: getPostArgs.args,
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id)
  },
})
