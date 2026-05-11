import { defineDelegation, type Delegation } from '@lupinum/trellis/backend'
import { getForwardedDelegation } from '@lupinum/trellis/backend'
import { v } from 'convex/values'

export type TeamTodoDelegation = Delegation

export const teamTodoDelegationValidator = v.object({
  subject: v.string(),
  reason: v.optional(v.string()),
  grantedBy: v.optional(v.string()),
})

export const delegation = defineDelegation({
  validator: teamTodoDelegationValidator,
  resolve: async (ctx, args): Promise<TeamTodoDelegation | null> =>
    getForwardedDelegation<TeamTodoDelegation>(ctx, args),
})
