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
 * - `query.unsafe(...)`   — bypasses the protected handler pipeline, but plain
 *                           `ctx.db` still keeps tenant isolation unless the
 *                           handler explicitly calls
 *                           `ctx.db.escapeTenantIsolation({ reason })`.
 *
 * The `posts` table in this harness is configured to participate in
 * tenant isolation via `organizationId` (see ./functions.ts). Tests in
 * `crossTenant.test.ts` exercise these handlers to prove runtime
 * enforcement and observability emission.
 */
import { defineArgs } from '@lupinum/trellis/args'
import { defineGuard } from '@lupinum/trellis/auth'
import { unsafe as unsafePermit } from '@lupinum/trellis/backend'
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
 * Read a post across tenants using the explicit tenant-isolation escape seam.
 *
 * In contrast to `posts.get`, this handler does not manually check
 * `actor.tenantId === post.organizationId`. The runtime's cross-tenant
 * db exposes the post regardless of the actor's tenant.
 */
export const getAnyPost = query.protected({
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
export const listAllPosts = query.protected({
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
 * Read a post through `query.unsafe(...)` while still using the default
 * tenant-aware `ctx.db` inside the handler.
 *
 * This exists to prove that `unsafe.*` does not silently become a
 * cross-tenant DB seam on its own.
 */
export const getAnyPostRaw = query.unsafe({
  permit: unsafePermit.permit({
    kind: 'harnessProbe',
    reason: 'Harness full-bypass post lookup.',
    scope: ['harness'],
  }),
  args: getPostArgs.args,
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id)
  },
})
