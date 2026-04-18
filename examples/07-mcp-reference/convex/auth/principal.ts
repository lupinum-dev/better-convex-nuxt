import { getAuth } from '@lupinum/trellis/auth'
import { definePrincipal } from '@lupinum/trellis/functions'
import { getForwardedPrincipal } from '@lupinum/trellis/trusted-caller'
import type { GenericActionCtx, GenericMutationCtx, GenericQueryCtx } from 'convex/server'
import { v } from 'convex/values'

import type { DataModel, Doc } from '../_generated/dataModel'

type PrincipalCtx =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>
  | GenericActionCtx<DataModel>

export type Role = Doc<'users'>['role']

export type McpReferencePrincipal =
  | { kind: 'anonymous' }
  | { kind: 'user'; userId: string }
  | { kind: 'agent'; agentId: string; userId: string; provider: 'mcp' }

export const mcpReferencePrincipalValidator = v.union(
  v.object({
    kind: v.literal('anonymous'),
  }),
  v.object({
    kind: v.literal('user'),
    userId: v.string(),
  }),
  v.object({
    kind: v.literal('agent'),
    agentId: v.string(),
    userId: v.string(),
    provider: v.literal('mcp'),
  }),
)

export const principal = definePrincipal<PrincipalCtx, McpReferencePrincipal>({
  validator: mcpReferencePrincipalValidator,
  resolve: async (ctx, args): Promise<McpReferencePrincipal> => {
    const forwarded = getForwardedPrincipal<McpReferencePrincipal>(ctx, args)
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
