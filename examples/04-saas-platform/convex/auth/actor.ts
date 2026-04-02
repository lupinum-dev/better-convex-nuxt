/**
 * Why this file exists:
 * The board example keeps its plan-aware actor app-owned, but now builds it on top of the shipped
 * default actor helper.
 */
import {
  createDefaultGetActor,
  defineActorExtension,
  type DefaultActor,
} from 'better-convex-nuxt/auth'
import type { GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import type { DataModel, Doc, Id } from '../_generated/dataModel'

type ProjectBoardActor = DefaultActor & {
  role: Doc<'users'>['role']
  tenantId: Id<'workspaces'>
  plan: Doc<'workspaces'>['plan']
}

type ProjectBoardCtx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>
const resolveActor = createDefaultGetActor<DataModel, { plan: Doc<'workspaces'>['plan'] }>(
  defineActorExtension({
    fields: async (ctx, user) => {
      const workspace = user.workspaceId ? await ctx.db.get(user.workspaceId) : null
      return {
        plan: (workspace?.plan ?? 'free') as Doc<'workspaces'>['plan'],
      }
    },
  }),
)

export type Actor = ProjectBoardActor | null

export async function getActor(ctx: ProjectBoardCtx): Promise<Actor> {
  const actor = await resolveActor(ctx)
  if (!actor?.tenantId) return null
  return actor as ProjectBoardActor
}
