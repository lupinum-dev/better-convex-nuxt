import { getAuth } from '@lupinum/trellis/auth'
import { definePrincipal } from '@lupinum/trellis/functions'
import { v } from 'convex/values'

export type KanbanPrincipal = { kind: 'anonymous' } | { kind: 'user'; userId: string }

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
  resolve: async (ctx): Promise<KanbanPrincipal> => {
    const auth = await getAuth(ctx)
    if (!auth) return { kind: 'anonymous' }
    return { kind: 'user', userId: auth.subject }
  },
})

