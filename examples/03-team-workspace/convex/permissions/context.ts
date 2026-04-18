import { definePermissionContext } from '@lupinum/trellis/auth'

import { teamWorkspacePermissionKeys, type TeamWorkspacePermissionMap } from '../../shared/permissions'
import { getActor } from '../auth/actor'
import { canCreateTodo, canReadTodo } from '../auth/checks'
import { query } from '../functions'

export const getPermissionContext = query(
  definePermissionContext({
    resolve: getActor,
    guards: {
      [teamWorkspacePermissionKeys.todoRead]: canReadTodo,
      [teamWorkspacePermissionKeys.todoCreate]: canCreateTodo,
    } satisfies Record<keyof TeamWorkspacePermissionMap, typeof canReadTodo>,
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
