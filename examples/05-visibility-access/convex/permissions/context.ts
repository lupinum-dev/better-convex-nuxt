import { definePermissionContext } from '@lupinum/trellis/auth'

import { knowledgeBasePermissionKeys, type KnowledgeBasePermissionMap } from '../../shared/permissions'
import { getActor } from '../auth/actor'
import {
  canCreateArticle,
  canCreateKB,
  canCreateShareToken,
  canManageEnrollments,
  canReadArticle,
  canReadKB,
} from '../auth/checks'
import { query } from '../functions'

export const getPermissionContext = query(
  definePermissionContext({
    resolve: getActor,
    guards: {
      [knowledgeBasePermissionKeys.kbCreate]: canCreateKB,
      [knowledgeBasePermissionKeys.kbRead]: canReadKB,
      [knowledgeBasePermissionKeys.articleCreate]: canCreateArticle,
      [knowledgeBasePermissionKeys.articleRead]: canReadArticle,
      [knowledgeBasePermissionKeys.enrollmentManage]: canManageEnrollments,
      [knowledgeBasePermissionKeys.shareCreate]: canCreateShareToken,
    } satisfies Record<keyof KnowledgeBasePermissionMap, typeof canReadKB>,
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
