import { defineAccessContext } from '@lupinum/trellis/auth'

import { getAppIdentity } from '../auth/app-identity'
import { permissions } from '../features'
import { query } from '../functions'

export const getAccessContext = query.protected(
  defineAccessContext({
    resolve: getAppIdentity,
    permissions,
    extend: async (ctx, appIdentity) => {
      const user = await ctx.db
        .query('users')
        .withIndex('by_auth_id', (q: any) => q.eq('authId', appIdentity.userId))
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
