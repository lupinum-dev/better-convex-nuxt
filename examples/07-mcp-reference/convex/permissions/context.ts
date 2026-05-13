import { defineAccessContext } from '@lupinum/trellis/auth'

import { getAccessIdentity } from '../auth/app-identity'
import { permissions } from '../features'
import { query } from '../functions'

export const getAccessContext = query.protected({
  ...defineAccessContext({
    resolve: getAccessIdentity,
    permissions,
    extend: async (ctx, appIdentity) => {
      const user = await ctx.db
        .query('users')
        .withIndex('by_auth_id', (q: any) => q.eq('authId', appIdentity.userId))
        .first()

      return {
        email: user?.email ?? null,
        displayName: user?.displayName ?? null,
      }
    },
  }),
  identityForwardingFunctionRef: 'permissions/context:getAccessContext',
})
