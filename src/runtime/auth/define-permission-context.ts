/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConvexError } from 'convex/values'

import { open, runCheck, type AnyCheck } from './define-guard.js'

type PermissionContextBase<TCan extends Record<string, boolean>> = {
  userId: string | null
  tenantId: string | null
  role: string | null
  can: TCan
}

export function definePermissionContext<
  TActor,
  TGuards extends Record<string, AnyCheck<NonNullable<TActor>>>,
  TContext extends Record<string, unknown> = Record<string, never>,
>(options: {
  resolve: (ctx: any) => Promise<TActor | null>
  guards: TGuards
  extend?: (ctx: any, actor: NonNullable<TActor>) => Promise<TContext> | TContext
}) {
  function evaluatePermission(
    actor: NonNullable<TActor>,
    check: AnyCheck<NonNullable<TActor>>,
  ): boolean {
    try {
      return !!runCheck(actor, check)
    } catch (error) {
      if (error instanceof ConvexError) return false
      throw error
    }
  }

  return {
    args: {},
    guard: open,
    handler: async (ctx: any) => {
      const actor = await options.resolve(ctx)
      if (!actor) return null

      const permissions = Object.fromEntries(
        Object.entries(options.guards).map(([key, check]) => [
          key,
          evaluatePermission(actor, check as AnyCheck<NonNullable<TActor>>),
        ]),
      ) as { [K in keyof TGuards]: boolean }

      const actorObj = actor as Record<string, unknown>
      const base: PermissionContextBase<{ [K in keyof TGuards]: boolean }> = {
        userId: typeof actorObj.userId === 'string' ? actorObj.userId : null,
        tenantId: typeof actorObj.tenantId === 'string' ? actorObj.tenantId : null,
        role: typeof actorObj.role === 'string' ? actorObj.role : null,
        can: permissions,
      }

      if (!options.extend) {
        return base
      }

      return {
        ...base,
        ...(await options.extend(ctx, actor)),
      }
    },
  }
}
