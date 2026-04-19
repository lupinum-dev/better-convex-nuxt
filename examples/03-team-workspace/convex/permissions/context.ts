import { definePermissionContext } from '@lupinum/trellis/auth'

import { getActor } from '../auth/actor'
import { teamWorkspacePermissions } from '../auth/permissions'
import { query } from '../functions'

export const getPermissionContext = query(
  definePermissionContext({
    resolve: getActor,
    permissions: teamWorkspacePermissions,
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
        email: user.email,
        displayName: user.displayName,
      }
    },
  }),
)
