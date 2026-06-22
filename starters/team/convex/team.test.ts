import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { internal } from './_generated/api'
import schema from './schema'
import { modules } from './test.setup'

describe('team starter invariants', () => {
  it('projects Better Auth users through the auth trigger path', async () => {
    const t = convexTest(schema, modules)

    await t.mutation(internal.auth.onCreate, {
      model: 'user',
      doc: {
        _id: 'auth_1',
        name: 'Ada',
        email: 'ada@example.com',
      },
    })

    const users = await t.run(async (ctx) => {
      return await ctx.db.query('users').take(10)
    })

    expect(users).toHaveLength(1)
    expect(users[0]).toMatchObject({
      authUserId: 'auth_1',
      name: 'Ada',
      email: 'ada@example.com',
    })
  })

  it('keeps app-owned product rows separate from Better Auth ids', async () => {
    const t = convexTest(schema, modules)

    const projectId = await t.run(async (ctx) => {
      return await ctx.db.insert('projects', {
        organizationId: 'better-auth-org-id',
        name: 'Launch',
        createdByAuthUserId: 'better-auth-user-id',
        createdAt: Date.now(),
      })
    })

    const auditEventId = await t.run(async (ctx) => {
      return await ctx.db.insert('auditEvents', {
        organizationId: 'better-auth-org-id',
        actorAuthUserId: 'better-auth-user-id',
        action: 'projects.create',
        resourceType: 'project',
        resourceId: projectId,
        createdAt: Date.now(),
      })
    })

    const rows = await t.run(async (ctx) => {
      return {
        projects: await ctx.db.query('projects').take(10),
        auditEvents: await ctx.db.query('auditEvents').take(10),
      }
    })

    expect(rows.projects).toHaveLength(1)
    expect(rows.projects[0]).toMatchObject({
      _id: projectId,
      organizationId: 'better-auth-org-id',
      createdByAuthUserId: 'better-auth-user-id',
    })
    expect(rows.auditEvents).toHaveLength(1)
    expect(rows.auditEvents[0]).toMatchObject({
      _id: auditEventId,
      organizationId: 'better-auth-org-id',
      actorAuthUserId: 'better-auth-user-id',
      resourceId: projectId,
    })
  })
})
