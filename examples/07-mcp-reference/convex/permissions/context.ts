import { definePermissionContext } from '@lupinum/trellis/auth'

import { mcpReferencePermissionKeys, type McpReferencePermissionMap } from '../../shared/permissions'
import type { Actor } from '../auth/actor'
import { getPermissionActor } from '../auth/actor'
import { canCreateRunbook, canManageMcpKeys, canReadWorkspaceRunbook } from '../auth/checks'
import { query } from '../functions'

type PermissionActor = NonNullable<Awaited<ReturnType<typeof getPermissionActor>>>

export const getPermissionContext = query(
  definePermissionContext({
    resolve: getPermissionActor,
    guards: {
      [mcpReferencePermissionKeys.runbookRead]: (actor) =>
        !!actor.tenantId && canReadWorkspaceRunbook(actor as Actor),
      [mcpReferencePermissionKeys.runbookCreate]: (actor) =>
        !!actor.tenantId && canCreateRunbook(actor as Actor),
      [mcpReferencePermissionKeys.mcpManage]: (actor) =>
        !!actor.tenantId && canManageMcpKeys(actor as Actor),
    } satisfies Record<keyof McpReferencePermissionMap, (actor: PermissionActor) => boolean>,
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
