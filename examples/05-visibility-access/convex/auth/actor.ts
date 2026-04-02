/**
 * Why this file exists:
 * The knowledge base actor includes managerId for team hierarchy visibility, built from the
 * composable actor primitive.
 */
import { defineActor, type DefaultActor } from 'better-convex-nuxt/auth'

import type { DataModel, Doc, Id } from '../_generated/dataModel'

type KnowledgeBaseActor = DefaultActor & {
  role: Doc<'users'>['role']
  tenantId: Id<'workspaces'>
  managerId?: string
}

const actor = defineActor
  .fromAuth<DataModel>()
  .extend({
    fields: async (_ctx, user) => ({
      role: user.role as Doc<'users'>['role'],
      tenantId: user.workspaceId as Id<'workspaces'> | undefined,
      managerId: user.managerId,
    }),
  })
  .filter((value): value is KnowledgeBaseActor => !!value.tenantId)

export type Actor = KnowledgeBaseActor | null

export const getActor = actor.resolve
