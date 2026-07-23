import { ConvexError } from 'convex/values'

import { components } from './_generated/api'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { authComponent } from './auth'
import { roleAllowsProjectPermissions, type ProjectPermission } from './betterAuth/access-control'

export async function requireBetterAuthProjectPermissions(
  ctx: QueryCtx | MutationCtx,
  args: {
    organizationId: string
    permissions: ProjectPermission[]
    deniedMessage: string
  },
) {
  if (args.permissions.length === 0) {
    throw new ConvexError('At least one project permission is required')
  }

  const user = await authComponent.getAuthUser(ctx)
  if (typeof user.id !== 'string') throw new ConvexError('Unauthenticated')
  const member = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: 'member',
    where: [
      { field: 'organizationId', value: args.organizationId },
      { field: 'userId', value: user.id },
    ],
  })) as { role?: string } | null
  const allowed = member?.role
    ?.split(',')
    .map((role) => role.trim())
    .some((role) => roleAllowsProjectPermissions(role, args.permissions))
  if (!allowed) {
    throw new ConvexError(args.deniedMessage)
  }

  return { user: user as { id: string } & Record<string, unknown> }
}
