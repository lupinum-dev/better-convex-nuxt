import { defineActingFor, type ActingFor } from '@lupinum/trellis/backend'
import { getForwardedActingFor } from '@lupinum/trellis/backend'
import { v } from 'convex/values'

export type TeamTodoDelegation = ActingFor

export const teamTodoDelegationValidator = v.object({
  subject: v.string(),
  reason: v.optional(v.string()),
  grantedBy: v.optional(v.string()),
})

export const actingFor = defineActingFor({
  validator: teamTodoDelegationValidator,
  resolve: async (ctx, args): Promise<TeamTodoDelegation | null> =>
    getForwardedActingFor<TeamTodoDelegation>(ctx, args),
})
