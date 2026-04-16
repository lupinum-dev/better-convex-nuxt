import { getAuth } from '@lupinum/trellis/auth'
import { definePrincipal } from '@lupinum/trellis/functions'
import type { GenericMutationCtx, GenericQueryCtx } from 'convex/server'
import { v } from 'convex/values'

import type { DataModel, Doc } from '../_generated/dataModel'

type PrincipalCtx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>

export type Role = Doc<'users'>['role']

export type ProjectBoardPrincipal =
  | { kind: 'anonymous' }
  | { kind: 'user'; userId: string }

export const projectBoardPrincipalValidator = v.union(
  v.object({
    kind: v.literal('anonymous'),
  }),
  v.object({
    kind: v.literal('user'),
    userId: v.string(),
  }),
)

export const principal = definePrincipal<PrincipalCtx, ProjectBoardPrincipal>({
  validator: projectBoardPrincipalValidator,
  resolve: async (ctx, args): Promise<ProjectBoardPrincipal> => {
    const forwarded = (args as { principal?: ProjectBoardPrincipal }).principal
    if (forwarded) return forwarded

    const auth = await getAuth(ctx)
    if (!auth) return { kind: 'anonymous' }

    return {
      kind: 'user',
      userId: auth.subject,
    }
  },
})
