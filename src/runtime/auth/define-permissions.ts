/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Compatibility helper for permission context queries.
 *
 * Prefer `definePermissionContext(...)` for new code so the guard registry stays
 * declarative, inspectable, and easier to keep in sync with the frontend.
 *
 * @example
 * ```ts
 * import { definePermissions } from 'better-convex-nuxt/auth'
 * import { can } from 'better-convex-nuxt/auth'
 * import { getActor } from './auth/actor'
 * import * as checks from './auth/checks'
 *
 * export default definePermissions({
 *   resolve: getActor,
 *   can: (actor) => ({
 *     'todo.create': can(actor, checks.canCreateTodo),
 *     'todo.read': can(actor, checks.canReadTodo),
 *   }),
 * })
 * ```
 */
export function definePermissions<
  TActor,
  TCan extends Record<string, boolean> = Record<string, boolean>,
  TContext extends Record<string, unknown> = Record<string, never>,
>(options: {
  /** Resolve the actor from the Convex query context. */
  resolve: (ctx: any) => Promise<TActor | null>

  /** Evaluate permission checks. Returns a map of permission key → boolean. */
  can: (actor: NonNullable<TActor>) => TCan

  /** Optional extra context fields to include in the permission context. */
  context?: (ctx: any, actor: NonNullable<TActor>) => Promise<TContext>
}) {
  return {
    args: {},
    handler: async (ctx: any) => {
      const actor = await options.resolve(ctx)
      if (!actor) return null

      const permissions = options.can(actor)

      const actorObj = actor as Record<string, unknown>
      const base: Record<string, unknown> = {
        userId: actorObj.userId ?? null,
        tenantId: actorObj.tenantId ?? null,
        role: actorObj.role ?? null,
        can: permissions,
      }

      if (options.context) {
        const extra = await options.context(ctx, actor)
        Object.assign(base, extra)
      }

      return base
    },
  }
}
