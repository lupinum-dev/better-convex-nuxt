import { definePermissionContext } from '@lupinum/trellis/auth'

import { saasPermissionKeys, type SaasPermissionMap } from '../../shared/permissions'
import { getActor } from '../auth/actor'
import {
  canArchiveProject,
  canAssignTask,
  canComment,
  canCreateProject,
  canCreateTask,
  canExportProjects,
  canManageMembers,
  canReadProject,
  canViewAudit,
  hasFeature,
} from '../auth/checks'
import { getUsage } from '../auth/limits'
import { query } from '../functions'

type Actor = NonNullable<Awaited<ReturnType<typeof getActor>>>

export const getPermissionContext = query(
  definePermissionContext({
    resolve: getActor,
    guards: {
      [saasPermissionKeys.projectCreate]: canCreateProject,
      [saasPermissionKeys.projectRead]: canReadProject,
      [saasPermissionKeys.projectArchive]: canArchiveProject,
      [saasPermissionKeys.projectExport]: canExportProjects,
      [saasPermissionKeys.taskCreate]: canCreateTask,
      [saasPermissionKeys.taskAssign]: canAssignTask,
      [saasPermissionKeys.commentCreate]: canComment,
      [saasPermissionKeys.workspaceMembers]: canManageMembers,
      [saasPermissionKeys.workspaceAudit]: canViewAudit,
      [saasPermissionKeys.workspaceExports]: hasFeature('exports'),
    } satisfies Record<keyof SaasPermissionMap, (actor: Actor) => boolean>,
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
        plan: actor.plan,
        email: user.email ?? null,
        displayName: user.displayName ?? null,
        usage: actor.tenantId ? { projects: await getUsage(ctx.db, actor, 'projects') } : undefined,
      }
    },
  }),
)
