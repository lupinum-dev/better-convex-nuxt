import { getAuth } from '@lupinum/trellis/auth'
import { definePrincipal } from '@lupinum/trellis/functions'
import type { GenericActionCtx, GenericMutationCtx, GenericQueryCtx } from 'convex/server'
import { v } from 'convex/values'

import type { DataModel } from '../_generated/dataModel'

export type KanbanPrincipal = { kind: 'anonymous' } | { kind: 'user'; userId: string }

type PrincipalCtx =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>
  | GenericActionCtx<DataModel>

export const principal = definePrincipal({
  validator: v.union(
    v.object({
      kind: v.literal('anonymous'),
    }),
    v.object({
      kind: v.literal('user'),
      userId: v.string(),
    }),
  ),
  resolve: async (ctx: PrincipalCtx): Promise<KanbanPrincipal> => {
    const auth = await getAuth(ctx)
    if (!auth) return { kind: 'anonymous' }
    return { kind: 'user', userId: auth.subject }
  },
})
