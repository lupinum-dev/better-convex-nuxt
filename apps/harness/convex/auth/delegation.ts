import { defineDelegation, getForwardedDelegation, type Delegation } from '@lupinum/trellis/backend'
import { v } from 'convex/values'

export type HarnessDelegation = Delegation

export const harnessDelegationValidator = v.object({
  subject: v.string(),
  reason: v.optional(v.string()),
  grantedBy: v.optional(v.string()),
})

export const delegation = defineDelegation({
  validator: harnessDelegationValidator,
  resolve: async (ctx, args): Promise<HarnessDelegation | null> =>
    getForwardedDelegation<HarnessDelegation>(ctx, args),
})
