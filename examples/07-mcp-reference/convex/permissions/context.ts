import { defineAccessContext } from '@lupinum/trellis/auth'

import { getAccessIdentity } from '../auth/appIdentity'
import { permissions } from '../features'
import { query } from '../functions'

export const getAccessContext = query.protected({
  ...defineAccessContext({
    resolve: getAccessIdentity,
    permissions,
    extend: async (ctx, appIdentity) => {
      const user = await ctx.db.get(appIdentity.userId)

      return {
        email: user?.email ?? null,
        displayName: user?.displayName ?? null,
      }
    },
  }),
  identityForwardingFunctionRef: 'permissions/context:getAccessContext',
})
