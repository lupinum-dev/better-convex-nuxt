import { getAuth } from '@lupinum/trellis/auth'
import { definePrincipal } from '@lupinum/trellis/functions'
import type { GenericActionCtx, GenericMutationCtx, GenericQueryCtx } from 'convex/server'
import { v } from 'convex/values'

import type { DataModel, Doc } from '../_generated/dataModel'

type PrincipalCtx =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>
  | GenericActionCtx<DataModel>

export type Role = Doc<'users'>['role']

export type TeamTodoPrincipal =
  | { kind: 'anonymous' }
  | { kind: 'user'; userId: string }
  | { kind: 'agent'; userId: string; agentId?: string; provider?: 'mcp' }

export const teamTodoPrincipalValidator = v.union(
  v.object({
    kind: v.literal('anonymous'),
  }),
  v.object({
    kind: v.literal('user'),
    userId: v.string(),
  }),
  v.object({
    kind: v.literal('agent'),
    userId: v.string(),
    agentId: v.optional(v.string()),
    provider: v.optional(v.literal('mcp')),
  }),
)

export const principal = definePrincipal<PrincipalCtx, TeamTodoPrincipal>({
  validator: teamTodoPrincipalValidator,
  resolve: async (ctx, args): Promise<TeamTodoPrincipal> => {
    const forwarded = (args as { principal?: TeamTodoPrincipal }).principal
    if (forwarded) return forwarded

    const auth = await getAuth(ctx)
    if (!auth) {
      return { kind: 'anonymous' }
    }

    return {
      kind: 'user',
      userId: auth.subject,
    }
  },
})
