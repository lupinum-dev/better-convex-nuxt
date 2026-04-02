/**
 * Why this file exists:
 * The example keeps the actor app-owned, but now builds it through the composable actor primitive.
 */
import { defineActor, type DefaultActor } from 'better-convex-nuxt/auth'

import type { DataModel, Doc, Id } from '../_generated/dataModel'

type TeamTodoActor = DefaultActor & {
  role: Doc<'users'>['role']
  tenantId: Id<'workspaces'>
}

const actor = defineActor
  .fromAuth<DataModel>()
  .extend({
    fields: async (_ctx, user) => ({
      role: user.role as Doc<'users'>['role'],
      tenantId: user.workspaceId as Id<'workspaces'> | undefined,
    }),
  })
  .filter((value): value is TeamTodoActor => !!value.tenantId)

export type Actor = TeamTodoActor | null

export const getActor = actor.resolve
