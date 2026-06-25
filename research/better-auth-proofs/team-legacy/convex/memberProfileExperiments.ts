import { ConvexError, v } from 'convex/values'

import { mutation } from './_generated/server'
import { createAuth } from './auth'

function requireExperimentEnabled() {
  if (process.env.ALLOW_TEST_RESET !== 'true') {
    throw new ConvexError('ALLOW_TEST_RESET=true is required for member profile experiments')
  }
}

export const addMemberWithProfile = mutation({
  args: {
    organizationId: v.string(),
    teamId: v.string(),
    userId: v.string(),
    sessionTokenForExperiment: v.string(),
  },
  handler: async (ctx, args) => {
    requireExperimentEnabled()

    const auth = createAuth(ctx)
    return await auth.api.addMember({
      headers: new Headers({
        authorization: `Bearer ${args.sessionTokenForExperiment}`,
      }),
      body: {
        organizationId: args.organizationId,
        userId: args.userId,
        role: 'member',
        teamId: args.teamId,
        title: 'Solutions Engineer',
        department: 'Customer Success',
        billable: true,
      },
    })
  },
})
