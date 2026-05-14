import { defineActingFor, getForwardedActingFor, type ActingFor } from '@lupinum/trellis/backend'
import { v } from 'convex/values'

export type HarnessDelegation = ActingFor

export const harnessDelegationValidator = v.object({
  subject: v.string(),
  reason: v.optional(v.string()),
  grantedBy: v.optional(v.string()),
})

export const actingFor = defineActingFor({
  validator: harnessDelegationValidator,
  resolve: async (ctx, args): Promise<HarnessDelegation | null> =>
    getForwardedActingFor<HarnessDelegation>(ctx, args),
})
