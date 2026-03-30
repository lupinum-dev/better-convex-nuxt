import { createAuth } from 'better-convex-nuxt/composables'

import { api } from '~/convex/_generated/api'

export const { usePermissions, useAuthGuard } = createAuth({
  query: api.organizations.getPermissionContext,
})
