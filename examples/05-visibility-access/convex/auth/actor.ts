/**
 * Why this file exists:
 * The knowledge base actor includes managerId for team hierarchy visibility, built from the
 * composable actor primitive.
 */
import { defineActor, type DefaultActor } from '@lupinum/trellis/auth'
import type { Infer } from 'convex/values'

import type { DataModel, Id } from '../_generated/dataModel'
import type { roleValidator } from '../features/users'

type UserRole = Infer<typeof roleValidator>

type KnowledgeBaseActor = DefaultActor & {
  role: UserRole
  tenantId: Id<'workspaces'>
  managerId: string | undefined
}

const actor = defineActor
  .fromAuth<DataModel>()
  .extend({
    fields: async (_ctx, user) => ({
      role: user.role as UserRole,
      tenantId: user.workspaceId as Id<'workspaces'> | undefined,
      managerId: user.managerId ?? undefined,
    }),
  })
  .filter((value): value is KnowledgeBaseActor => !!value.tenantId)

export type Actor = KnowledgeBaseActor

export async function getActor(ctx: Parameters<typeof actor.resolve>[0]): Promise<Actor | null> {
  return await actor.resolve(ctx)
}
