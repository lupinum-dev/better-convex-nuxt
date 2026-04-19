import { customQuery } from 'convex-helpers/server/customFunctions'
import { v } from 'convex/values'

/**
 * Experiment 12: __workspaceId injection via customQuery input
 *
 * Spec §14.3: the actor resolver consumes a `__workspaceId` arg injected
 * by the Nuxt module (from a cookie/header). That arg must:
 *   - be consumable in the `input` phase
 *   - be stripped before the handler sees args
 *   - allow the actor resolver to scope to the chosen workspace
 *
 * convex-helpers' customQuery `args` declaration is the mechanism. Any arg
 * declared in `args:` is consumed by the input callback and NOT forwarded.
 *
 * Cases covered:
 *   12a  input consumes __workspaceId, handler args do not contain it
 *   12b  resolver uses __workspaceId to pick the correct workspace
 *   12c  omitting __workspaceId (optional) still resolves to a default
 *   12d  user not in the requested workspace → actor null → throw
 */
import { query as rawQuery } from './_generated/server'
import type { QueryCtx } from './_generated/server'

type Actor = {
  userId: string
  workspaceId: string
  role: string
} | null

async function resolveActorForWorkspace(
  ctx: QueryCtx,
  authId: string,
  workspaceId: string | undefined,
): Promise<Actor> {
  // If no workspaceId provided, fall back to the first membership.
  // This mirrors the spec's graduated on-ramp: simple case without a switcher.
  const user = await ctx.db
    .query('users')
    .withIndex('by_auth_id', (q) => q.eq('authId', authId))
    .first()
  if (!user || !user.organizationId) return null

  if (workspaceId && user.organizationId !== workspaceId) {
    // User is not in the requested workspace — real app would check a
    // memberships table here. In the harness, users have one org.
    return null
  }

  return {
    userId: authId,
    workspaceId: user.organizationId,
    role: user.role,
  }
}

// customQuery that consumes __workspaceId in input, strips it before handler
const scopedQuery = customQuery(rawQuery, {
  args: {
    __workspaceId: v.optional(v.string()),
  },
  input: async (ctx, args) => {
    // The identity is simulated — in production this comes from ctx.auth.
    // For the experiment we use a test header-like approach: authId passed.
    const identity = await ctx.auth.getUserIdentity()
    const authId = identity?.subject
    if (!authId) {
      return {
        ctx: { actor: null as Actor, resolvedWorkspaceId: null },
        args: {},
      }
    }
    const actor = await resolveActorForWorkspace(ctx, authId, args.__workspaceId)
    return {
      ctx: { actor, resolvedWorkspaceId: args.__workspaceId ?? null },
      args: {}, // __workspaceId is NOT forwarded
    }
  },
})

// ---- Test 12a+b+c+d: one handler that reports what it sees ----

export const whoAmIAt = scopedQuery({
  args: { probe: v.optional(v.string()) }, // a handler-level arg
  returns: v.object({
    actorWorkspace: v.union(v.string(), v.null()),
    role: v.optional(v.string()),
    handlerArgsKeys: v.array(v.string()),
    resolvedWorkspaceIdFromInput: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    return {
      actorWorkspace: ctx.actor?.workspaceId ?? null,
      role: ctx.actor?.role,
      // Prove __workspaceId is NOT in the handler's args.
      handlerArgsKeys: Object.keys(args),
      resolvedWorkspaceIdFromInput: ctx.resolvedWorkspaceId,
    }
  },
})
