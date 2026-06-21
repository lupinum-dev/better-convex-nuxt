import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'
import { modules } from './test.setup'

async function seedReviewer(t: ReturnType<typeof convexTest>, subject: string) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', {
      subject,
      name: subject,
      email: `${subject}@example.com`,
      createdAt: Date.now(),
      updatedAt: Date.now()
    })
    const organizationId = await ctx.db.insert('organizations', {
      name: 'Acme',
      createdBy: userId,
      createdAt: Date.now()
    })
    await ctx.db.insert('memberships', {
      organizationId,
      userId,
      role: 'reviewer',
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now()
    })
    return { userId, organizationId }
  })
}

async function seedDraft(t: ReturnType<typeof convexTest>, organizationId: Id<'organizations'>) {
  return await t.mutation(api.drafts.createFromAgent, {
    organizationId,
    title: 'Draft',
    body: 'Draft body',
    sourceThreadId: 'thread_1'
  })
}

describe('vertical-ai starter invariants', () => {
  it('AI writes draft state, not canonical state', async () => {
    const t = convexTest(schema, modules)
    const { organizationId } = await seedReviewer(t, 'reviewer')

    await seedDraft(t, organizationId)

    const records = await t.run(async (ctx) => {
      return await ctx.db.query('domainRecords').collect()
    })
    const drafts = await t.run(async (ctx) => {
      return await ctx.db.query('drafts').collect()
    })

    expect(drafts).toHaveLength(1)
    expect(records).toHaveLength(0)
  })

  it('human approval promotes draft to canonical state', async () => {
    const t = convexTest(schema, modules)
    const { organizationId } = await seedReviewer(t, 'reviewer')
    const draftId = await seedDraft(t, organizationId)

    const recordId = await t.withIdentity({ subject: 'reviewer' }).mutation(api.approvals.approveDraft, {
      organizationId,
      draftId
    })

    const records = await t.run(async (ctx) => await ctx.db.query('domainRecords').collect())
    expect(records.find((record) => record._id === recordId)?.sourceDraftId).toBe(draftId)
  })

  it('rejected draft cannot be promoted', async () => {
    const t = convexTest(schema, modules)
    const { organizationId } = await seedReviewer(t, 'reviewer')
    const draftId = await seedDraft(t, organizationId)

    await t.withIdentity({ subject: 'reviewer' }).mutation(api.approvals.rejectDraft, {
      organizationId,
      draftId
    })

    await expect(
      t.withIdentity({ subject: 'reviewer' }).mutation(api.approvals.approveDraft, {
        organizationId,
        draftId
      })
    ).rejects.toThrow('Only pending drafts can be approved')
  })

  it('approval records actor and source draft', async () => {
    const t = convexTest(schema, modules)
    const { organizationId, userId } = await seedReviewer(t, 'reviewer')
    const draftId = await seedDraft(t, organizationId)

    await t.withIdentity({ subject: 'reviewer' }).mutation(api.approvals.approveDraft, {
      organizationId,
      draftId
    })

    const events = await t.run(async (ctx) => await ctx.db.query('auditEvents').collect())
    expect(events[0]?.actorUserId).toBe(userId)
    expect(events[0]?.sourceDraftId).toBe(draftId)
  })
})
