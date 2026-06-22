import { ConvexError, v } from 'convex/values'

import type { Doc, TableNames } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { mutation, query } from './_generated/server'
import { writeAuditEvent } from './audit'

const EXPERIMENT_RESET_ENV = 'ALLOW_TEST_RESET'

const appTables = [
  'auditEvents',
  'projects',
  'invitations',
  'memberships',
  'organizations',
  'users',
] as const satisfies readonly TableNames[]

function requireExperimentResetEnabled() {
  if (process.env[EXPERIMENT_RESET_ENV] !== 'true') {
    throw new ConvexError(`${EXPERIMENT_RESET_ENV}=true is required for experiment mutations`)
  }
}

async function deleteAllFromTable<Table extends TableNames>(ctx: MutationCtx, table: Table) {
  let deleted = 0

  for (;;) {
    const docs = await ctx.db.query(table).take(100)
    if (docs.length === 0) {
      return deleted
    }

    for (const doc of docs) {
      await ctx.db.delete(doc._id)
      deleted += 1
    }
  }
}

async function countTable<Table extends TableNames>(ctx: { db: { query: MutationCtx['db']['query'] } }, table: Table) {
  let count = 0

  for (;;) {
    const docs = await ctx.db.query(table).take(100)
    count += docs.length
    if (docs.length < 100) {
      return count
    }
  }
}

async function getTableCounts(ctx: { db: { query: MutationCtx['db']['query'] } }) {
  const counts: Record<(typeof appTables)[number], number> = {
    auditEvents: 0,
    projects: 0,
    invitations: 0,
    memberships: 0,
    organizations: 0,
    users: 0,
  }

  for (const table of appTables) {
    counts[table] = await countTable(ctx, table)
  }

  return counts
}

export const resetForExperiment = mutation({
  args: {},
  handler: async (ctx) => {
    requireExperimentResetEnabled()

    const deleted: Record<(typeof appTables)[number], number> = {
      auditEvents: 0,
      projects: 0,
      invitations: 0,
      memberships: 0,
      organizations: 0,
      users: 0,
    }

    for (const table of appTables) {
      deleted[table] = await deleteAllFromTable(ctx, table)
    }

    return {
      ok: true,
      deleted,
      counts: await getTableCounts(ctx),
    }
  },
})

export const seedOrganizationScenario = mutation({
  args: {
    authUserId: v.optional(v.string()),
    email: v.optional(v.string()),
    organizationName: v.optional(v.string()),
    projectName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireExperimentResetEnabled()

    const now = Date.now()
    const authUserId = args.authUserId ?? `experiment-user-${now}`
    const email = args.email ?? `${authUserId}@example.com`
    const organizationName = args.organizationName ?? 'Experiment Organization'
    const projectName = args.projectName ?? 'Experiment Project'

    const userId = await ctx.db.insert('users', {
      authUserId,
      name: 'Experiment User',
      email,
      createdAt: now,
      updatedAt: now,
    })

    const organizationId = await ctx.db.insert('organizations', {
      name: organizationName,
      createdBy: userId,
      createdAt: now,
    })

    const membershipId = await ctx.db.insert('memberships', {
      organizationId,
      userId,
      role: 'owner',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })

    const projectId = await ctx.db.insert('projects', {
      organizationId,
      name: projectName,
      createdBy: userId,
      createdAt: now,
    })

    await writeAuditEvent(ctx, {
      organizationId,
      actorUserId: userId,
      action: 'experiments.seedOrganizationScenario',
      resourceType: 'project',
      resourceId: projectId,
    })

    return {
      authUserId,
      email,
      userId,
      organizationId,
      membershipId,
      projectId,
      counts: await getTableCounts(ctx),
    }
  },
})

export const renameOrganizationForExperiment = mutation({
  args: {
    organizationId: v.id('organizations'),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    requireExperimentResetEnabled()

    const name = args.name.trim()
    if (!name) {
      throw new ConvexError('Organization name is required')
    }

    const organization = await ctx.db.get(args.organizationId)
    if (!organization) {
      throw new ConvexError('Organization not found')
    }

    await ctx.db.patch(args.organizationId, { name })
    await writeAuditEvent(ctx, {
      organizationId: args.organizationId,
      actorUserId: organization.createdBy,
      action: 'experiments.renameOrganizationForExperiment',
      resourceType: 'organization',
      resourceId: args.organizationId,
    })

    return await ctx.db.get(args.organizationId)
  },
})

export const verify = query({
  args: {
    organizationId: v.optional(v.id('organizations')),
  },
  handler: async (ctx, args) => {
    const counts = await getTableCounts(ctx)
    const organizations = await ctx.db.query('organizations').take(20)

    const organization =
      args.organizationId !== undefined
        ? await ctx.db.get(args.organizationId)
        : organizations[0] ?? null

    if (!organization) {
      return {
        ok: counts.organizations === 0,
        reason: counts.organizations === 0 ? 'empty' : 'organization-not-found',
        counts,
      }
    }

    const memberships = await ctx.db
      .query('memberships')
      .withIndex('by_org', (q) => q.eq('organizationId', organization._id))
      .take(100)
    const projects = await ctx.db
      .query('projects')
      .withIndex('by_org', (q) => q.eq('organizationId', organization._id))
      .take(100)
    const auditEvents = await ctx.db
      .query('auditEvents')
      .withIndex('by_org_created', (q) => q.eq('organizationId', organization._id))
      .take(100)

    const activeOwners = memberships.filter(
      (membership: Doc<'memberships'>) =>
        membership.status === 'active' && membership.role === 'owner',
    )

    const problems = []
    if (activeOwners.length !== 1) problems.push('expected-exactly-one-active-owner')
    if (projects.length < 1) problems.push('expected-at-least-one-project')
    if (auditEvents.length < 1) problems.push('expected-at-least-one-audit-event')

    return {
      ok: problems.length === 0,
      problems,
      counts,
      organization: {
        id: organization._id,
        name: organization.name,
      },
      memberships: memberships.map((membership) => ({
        id: membership._id,
        role: membership.role,
        status: membership.status,
        userId: membership.userId,
      })),
      projects: projects.map((project) => ({
        id: project._id,
        name: project.name,
      })),
      auditEvents: auditEvents.map((event) => ({
        id: event._id,
        action: event.action,
        resourceType: event.resourceType,
      })),
    }
  },
})
