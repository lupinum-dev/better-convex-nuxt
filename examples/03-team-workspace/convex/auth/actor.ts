/**
 * Why this file exists:
 * The example keeps the actor app-owned, but now builds it through the composable actor primitive.
 */
import { defineActor, type DefaultActor } from '@lupinum/trellis/auth'

import type { DataModel, Doc, Id } from '../_generated/dataModel'

type TeamTodoActor = DefaultActor & {
  role: Doc<'users'>['role']
  tenantId?: Id<'workspaces'>
}

const actor = defineActor.fromAuth<DataModel>().extend({
  fields: async (_ctx, user) => ({
    role: user.role as Doc<'users'>['role'],
    tenantId: user.workspaceId as Id<'workspaces'> | undefined,
  }),
})

export type Actor = TeamTodoActor

export async function getActor(ctx: Parameters<typeof actor.resolve>[0]): Promise<Actor | null> {
  return await actor.resolve(ctx)
}
