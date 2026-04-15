import { getAuth } from '@lupinum/trellis/auth'
import { definePrincipal } from '@lupinum/trellis/functions'
import { v } from 'convex/values'

import type { Doc } from '../_generated/dataModel'

export type Role = Doc<'users'>['role']

export type McpReferencePrincipal =
  | { kind: 'anonymous' }
  | { kind: 'user'; userId: string }
  | { kind: 'mcp'; mcpKeyId: string; userId: string }

export const mcpReferencePrincipalValidator = v.union(
  v.object({
    kind: v.literal('anonymous'),
  }),
  v.object({
    kind: v.literal('user'),
    userId: v.string(),
  }),
  v.object({
    kind: v.literal('mcp'),
    mcpKeyId: v.string(),
    userId: v.string(),
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
