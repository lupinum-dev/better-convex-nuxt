/**
 * Why this file exists:
 * The example keeps the actor app-owned, but now delegates the standard auth + trusted-caller
 * resolution to the shipped actor helper.
 */
import { createDefaultGetActor, type DefaultActor } from 'better-convex-nuxt/auth'
import type { GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import type { DataModel, Doc, Id } from '../_generated/dataModel'

type TeamTodoCtx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>
type TeamTodoActor = DefaultActor & {
  role: Doc<'users'>['role']
  tenantId: Id<'workspaces'>
}

const resolveActor = createDefaultGetActor<DataModel>()

export type Actor = TeamTodoActor | null

export async function getActor(ctx: TeamTodoCtx): Promise<Actor> {
  const actor = await resolveActor(ctx)
  if (!actor?.tenantId) return null
  return actor as TeamTodoActor
}
