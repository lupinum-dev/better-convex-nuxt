/**
 * Why this file exists:
 * The knowledge base appIdentity includes managerId for team hierarchy visibility, built from the
 * composable appIdentity primitive.
 */
import { defineAppIdentity, type DefaultAppIdentity } from '@lupinum/trellis/auth'
import type { Infer } from 'convex/values'

import type { DataModel, Id } from '../_generated/dataModel'
import type { roleValidator } from '../features/users'

type UserRole = Infer<typeof roleValidator>

type KnowledgeBaseActor = DefaultAppIdentity & {
  role: UserRole
  workspaceId: Id<'workspaces'>
  managerId: string | undefined
}

const appIdentity = defineAppIdentity
  .fromAuth<DataModel>()
  .extend({
    fields: async (_ctx, user) => ({
      role: user.role as UserRole,
      workspaceId: user.workspaceId as Id<'workspaces'> | undefined,
      managerId: user.managerId ?? undefined,
    }),
  })
  .filter((value): value is KnowledgeBaseActor => !!value.workspaceId)

export type AppIdentity = KnowledgeBaseActor

export async function getAppIdentity(
  ctx: Parameters<typeof appIdentity.resolve>[0],
): Promise<AppIdentity | null> {
  return await appIdentity.resolve(ctx)
}
