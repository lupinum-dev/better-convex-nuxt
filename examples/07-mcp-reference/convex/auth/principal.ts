import { getAuth } from '@lupinum/trellis/auth'
import { definePrincipal } from '@lupinum/trellis/functions'
import { v } from 'convex/values'

import type { Doc } from '../_generated/dataModel'

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

export const principal = definePrincipal({
  validator: mcpReferencePrincipalValidator,
  resolve: async (ctx, args): Promise<McpReferencePrincipal> => {
    const forwarded = (args as { principal?: McpReferencePrincipal }).principal
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
