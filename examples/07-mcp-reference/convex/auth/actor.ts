/**
 * Why this file exists:
 * The example keeps the actor app-owned, but now builds it through the composable actor primitive.
 */
import { defineActor, type DefaultActor } from '@lupinum/trellis/auth'

import type { DataModel, Doc, Id } from '../_generated/dataModel'

type McpReferenceActor = DefaultActor & {
  role: Doc<'users'>['role']
  tenantId: Id<'workspaces'>
}

const permissionActor = defineActor.fromAuth<DataModel>().extend({
  fields: async (_ctx, user) => ({
    role: user.role as Doc<'users'>['role'],
    tenantId: user.workspaceId as Id<'workspaces'> | undefined,
  }),
})

const actor = permissionActor.filter((value): value is McpReferenceActor => !!value.tenantId)

export type Actor = McpReferenceActor | null

export const getActor = actor.resolve
export const getPermissionActor = permissionActor.resolve
