import { defineDelegation, type Delegation } from '@lupinum/trellis/functions'
import { getForwardedDelegation } from '@lupinum/trellis/trusted-forwarding'
import { v } from 'convex/values'

export type McpReferenceDelegation = Delegation

export const mcpReferenceDelegationValidator = v.object({
  subject: v.string(),
  reason: v.optional(v.string()),
  grantedBy: v.optional(v.string()),
})

export const delegation = defineDelegation({
  validator: mcpReferenceDelegationValidator,
  resolve: async (ctx, args): Promise<McpReferenceDelegation | null> =>
    getForwardedDelegation<McpReferenceDelegation>(ctx, args),
})
