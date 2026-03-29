import { defineTenant, extractScopedTables, type TenantUser } from '../../src/runtime/tenant'
import { postTableMeta } from '../shared/schemas/post'

const tableMetas = {
  posts: postTableMeta,
  comments: { tenant: { scoped: true } },
  invites: { tenant: { scoped: true } },
} as const

export default defineTenant({
  orgField: 'organizationId',

  scopedTables: extractScopedTables(tableMetas),

  resolveUser: async (ctx: any): Promise<TenantUser | null> => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null

    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', (q: any) => q.eq('authId', identity.subject))
      .first()

    if (!user?.organizationId) return null

    return {
      _id: user._id,
      userId: user.authId,
      orgId: user.organizationId,
      role: user.role,
    }
  },
})
