/**
 * Why this file exists:
 * The board example keeps its plan-aware actor app-owned, but composes it through the shipped
 * actor builder instead of custom wrapper helpers.
 */
import { defineActor, type DefaultActor } from '@lupinum/trellis/auth'
import type { GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import type { DataModel, Doc, Id } from '../_generated/dataModel'

type ProjectBoardActor = DefaultActor & {
  role: Doc<'users'>['role']
  tenantId?: Id<'workspaces'>
  plan: Doc<'workspaces'>['plan']
}

type ProjectBoardCtx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>
const actor = defineActor
  .fromAuth<DataModel>()
  .extend({
    fields: async (ctx, user) => {
      const workspace = user.workspaceId ? await ctx.db.get(user.workspaceId) : null
      return {
        plan: (workspace?.plan ?? 'free') as Doc<'workspaces'>['plan'],
      }
    },
  })

export type Actor = ProjectBoardActor

export async function getActor(ctx: ProjectBoardCtx): Promise<Actor | null> {
  return await actor.resolve(ctx) as Actor | null
}
