import { definePermissionContext } from '@lupinum/trellis/auth'

import { getPermissionActor } from '../auth/actor'
import { mcpReferencePermissions } from '../auth/permissions'
import { query } from '../functions'

export const getPermissionContext = query(
  definePermissionContext({
    resolve: getPermissionActor,
    permissions: mcpReferencePermissions,
    extend: async (ctx, actor) => {
      const user = await ctx.db
        .query('users')
        .withIndex('by_auth_id', (q: any) => q.eq('authId', actor.userId))
        .first()

      return {
        email: user?.email ?? null,
        displayName: user?.displayName ?? null,
      }
    },
  }),
)
