import { ConvexError } from 'convex/values'

import type { MutationCtx, QueryCtx } from './_generated/server'
import { authComponent, createAuth } from './auth'

type ProjectPermission = 'create' | 'read' | 'delete'

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

  const auth = createAuth(ctx)
  const headers = await authComponent.getHeaders(ctx)
  const session = await auth.api.getSession({ headers })
  if (!session) {
    throw new ConvexError('Unauthenticated')
  }

  const allowed = await auth.api.hasPermission({
    headers,
    body: {
      organizationId: args.organizationId,
      permissions: {
        project: args.permissions,
      },
    },
  })

  if (!allowed.success) {
    throw new ConvexError(args.deniedMessage)
  }

  return {
    headers,
    user: session.user,
  }
}
