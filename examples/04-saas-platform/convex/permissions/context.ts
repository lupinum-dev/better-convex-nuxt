import { definePermissionContext } from '@lupinum/trellis/auth'

import { getActor } from '../auth/actor'
import { getUsage } from '../auth/limits'
import { saasPermissions } from '../auth/permissions'
import { query } from '../functions'

export const getPermissionContext = query(
  definePermissionContext({
    resolve: getActor,
    permissions: saasPermissions,
    extend: async (ctx, actor) => {
      const user = await ctx.db
        .query('users')
        .withIndex('by_auth_id', (q: any) => q.eq('authId', actor.userId))
        .first()

      if (!user) {
        return {
          email: null,
          displayName: null,
        }
      }

      return {
        plan: actor.plan,
        email: user.email ?? null,
        displayName: user.displayName ?? null,
        usage: actor.tenantId ? { projects: await getUsage(ctx.db, actor, 'projects') } : undefined,
      }
    },
  }),
)
