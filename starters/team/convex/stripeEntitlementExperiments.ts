import { ConvexError, v } from 'convex/values'

import { components } from './_generated/api'
import { mutation } from './_generated/server'
import { authComponent, createAuth } from './auth'
import { projectLimitForPlan } from './billingPlans'

async function requireProjectCreatePermission(
  ctx: Parameters<typeof authComponent.getHeaders>[0],
  args: {
    organizationId: string
    sessionTokenForExperiment: string
  }
) {
  if (process.env.ALLOW_TEST_RESET !== 'true') {
    throw new ConvexError('Session token experiment path is disabled')
  }

  const headers = new Headers({
    authorization: `Bearer ${args.sessionTokenForExperiment}`,
  })
  const auth = createAuth(ctx)
  const session = await auth.api.getSession({ headers })
  if (!session) {
    throw new ConvexError('Unauthenticated')
  }

  const allowed = await auth.api.hasPermission({
    headers,
    body: {
      organizationId: args.organizationId,
      permissions: {
        project: ['create'],
      },
    },
  })

  if (!allowed.success) {
    throw new ConvexError('Missing project:create permission')
  }

  return session.user
}

async function requireActiveProjectLimit(
  ctx: Parameters<typeof authComponent.getHeaders>[0],
  organizationId: string
) {
  const subscription = await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: 'subscription',
    where: [
      { field: 'referenceId', value: organizationId },
      { field: 'status', value: 'active' },
    ],
  })

  if (!subscription) {
    throw new ConvexError('Active subscription required')
  }

  if (typeof subscription.periodEnd === 'number' && subscription.periodEnd <= Date.now()) {
    throw new ConvexError('Active subscription period has expired')
  }

  const projectLimit = projectLimitForPlan(
    typeof subscription.plan === 'string' ? subscription.plan : undefined
  )
  if (projectLimit === null) {
    throw new ConvexError('Subscription plan has no project limit')
  }

  return {
    projectLimit,
    subscriptionId: String(subscription._id),
    plan: String(subscription.plan),
  }
}

export const createProjectWithPlanLimit = mutation({
  args: {
    organizationId: v.string(),
    name: v.string(),
    sessionTokenForExperiment: v.string(),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim()
    if (!name) {
      throw new ConvexError('Project name is required')
    }

    const user = await requireProjectCreatePermission(ctx, args)
    const entitlement = await requireActiveProjectLimit(ctx, args.organizationId)
    const existingProjects = await ctx.db
      .query('projects')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .collect()

    if (existingProjects.length >= entitlement.projectLimit) {
      throw new ConvexError(`Project limit reached for ${entitlement.plan} plan`)
    }

    const projectId = await ctx.db.insert('projects', {
      organizationId: args.organizationId,
      name,
      createdByAuthUserId: user.id,
      createdAt: Date.now(),
    })

    await ctx.db.insert('auditEvents', {
      organizationId: args.organizationId,
      actorAuthUserId: user.id,
      action: 'projects.createWithPlanLimit',
      resourceType: 'project',
      resourceId: projectId,
      createdAt: Date.now(),
    })

    return {
      projectId,
      projectCount: existingProjects.length + 1,
      projectLimit: entitlement.projectLimit,
      subscriptionId: entitlement.subscriptionId,
    }
  },
})
