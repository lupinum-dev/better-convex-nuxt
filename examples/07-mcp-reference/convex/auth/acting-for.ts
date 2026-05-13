import { defineActingFor, type ActingFor } from '@lupinum/trellis/backend'
import { getForwardedActingFor } from '@lupinum/trellis/backend'
import { v } from 'convex/values'

export type McpReferenceDelegation = ActingFor

export const mcpReferenceDelegationValidator = v.object({
  subject: v.string(),
  reason: v.optional(v.string()),
  grantedBy: v.optional(v.string()),
})

export const actingFor = defineActingFor({
  validator: mcpReferenceDelegationValidator,
  // Only trusted forwarded calls carry actingFor in this example. Browser
  // requests run without a represented user.
  resolve: async (ctx, args): Promise<McpReferenceDelegation | null> =>
    getForwardedActingFor<McpReferenceDelegation>(ctx, args),
})
