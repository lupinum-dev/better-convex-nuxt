/**
 * Why this file exists:
 * The example keeps the actor app-owned, but now delegates the standard browser + trusted-caller
 * lookup path to the shipped helper.
 */
import { createDefaultGetActor, type DefaultActor } from 'better-convex-nuxt/auth'
import type { GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import type { DataModel, Doc, Id } from '../_generated/dataModel'

type McpReferenceCtx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>
type McpReferenceActor = DefaultActor & {
  role: Doc<'users'>['role']
  tenantId: Id<'workspaces'>
}

const resolveActor = createDefaultGetActor<DataModel>()

export type Actor = McpReferenceActor | null

export async function getActor(ctx: McpReferenceCtx): Promise<Actor> {
  const actor = await resolveActor(ctx)
  if (!actor?.tenantId) return null
  return actor as McpReferenceActor
}
