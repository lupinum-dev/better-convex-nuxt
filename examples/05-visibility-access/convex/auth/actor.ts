/**
 * Why this file exists:
 * The knowledge base actor includes managerId for team hierarchy visibility, but still delegates
 * the standard lookup path to the shipped actor helper.
 */
import {
  createDefaultGetActor,
  defineActorExtension,
  type DefaultActor,
} from 'better-convex-nuxt/auth'
import type { GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import type { DataModel, Doc, Id } from '../_generated/dataModel'

type KnowledgeBaseActor = DefaultActor & {
  role: Doc<'users'>['role']
  tenantId: Id<'workspaces'>
  managerId?: string
}

type Ctx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>
const resolveActor = createDefaultGetActor<DataModel, { managerId?: string }>(
  defineActorExtension({
    fields: async (_ctx, user) => ({
      managerId: user.managerId,
    }),
  }),
)

export type Actor = KnowledgeBaseActor | null

export async function getActor(ctx: Ctx): Promise<Actor> {
  const actor = await resolveActor(ctx)
  if (!actor?.tenantId) return null
  return actor as KnowledgeBaseActor
}
