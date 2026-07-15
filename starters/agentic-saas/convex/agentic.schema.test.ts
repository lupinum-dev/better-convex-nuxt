import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { startDelegatedRunAfterPermissionCheck } from './agentRuns'
import schema from './schema'
import { modules } from './test.setup'

describe('agentic-saas schema and audit invariants', () => {
  it('does not introduce app-owned organization or membership tables', async () => {
    const tables = (schema as { tables: Record<string, unknown> }).tables

    expect(Object.keys(tables)).not.toContain('organizations')
    expect(Object.keys(tables)).not.toContain('memberships')
  })

  it('keeps app-owned schema limited to canonical domain tables', async () => {
    const tables = (schema as { tables: Record<string, unknown> }).tables

    expect(Object.keys(tables).sort()).toEqual([
      'agentAuditEvents',
      'agentRuns',
      'agentUsageEvents',
      'productAuditEvents',
      'productRecords',
      'projectDeletionRequests',
      'projectDrafts',
    ])
  })

  it('keeps audit actions and resource types schema-bounded', async () => {
    const t = convexTest(schema, modules)

    await expect(
      t.run(async (ctx) => {
        await ctx.db.insert('productAuditEvents', {
          organizationId: 'better-auth-org-id',
          actor: {
            kind: 'user',
            authUserId: 'better-auth-user-id',
          },
          action: 'unexpected.audit.action' as never,
          resourceType: 'productRecord',
          resourceId: 'invalid-resource',
          createdAt: Date.now(),
        })
      }),
    ).rejects.toThrow('unexpected.audit.action')

    await expect(
      t.run(async (ctx) => {
        const agentRunId = await startDelegatedRunAfterPermissionCheck(
          ctx,
          {
            organizationId: 'better-auth-org-id',
            agentName: 'project-assistant',
            startedByAuthUserId: 'better-auth-user-id',
            capabilities: ['project:draft'],
          },
          async () => ({ authUserId: 'better-auth-user-id' }),
        )

        await ctx.db.insert('agentAuditEvents', {
          organizationId: 'better-auth-org-id',
          actor: {
            kind: 'agent',
            agentRunId,
            delegatedByAuthUserId: 'better-auth-user-id',
          },
          action: 'projectDrafts.create',
          capability: 'project:draft',
          resourceType: 'unexpectedResource' as never,
          resourceId: 'invalid-resource',
          createdAt: Date.now(),
        })
      }),
    ).rejects.toThrow('unexpectedResource')
  })

  it('requires resource identity for retained audit rows', async () => {
    const t = convexTest(schema, modules)

    await expect(
      t.run(async (ctx) => {
        await ctx.db.insert('productAuditEvents', {
          organizationId: 'better-auth-org-id',
          actor: {
            kind: 'user',
            authUserId: 'better-auth-user-id',
          },
          action: 'projectDrafts.reject',
          resourceType: 'projectDraft',
          createdAt: Date.now(),
        } as never)
      }),
    ).rejects.toThrow('resourceId')

    await expect(
      t.run(async (ctx) => {
        const agentRunId = await startDelegatedRunAfterPermissionCheck(
          ctx,
          {
            organizationId: 'better-auth-org-id',
            agentName: 'project-assistant',
            startedByAuthUserId: 'better-auth-user-id',
            capabilities: ['project:draft'],
          },
          async () => ({ authUserId: 'better-auth-user-id' }),
        )

        await ctx.db.insert('agentAuditEvents', {
          organizationId: 'better-auth-org-id',
          actor: {
            kind: 'agent',
            agentRunId,
            delegatedByAuthUserId: 'better-auth-user-id',
          },
          action: 'projectDrafts.create',
          capability: 'project:draft',
          resourceType: 'projectDraft',
          createdAt: Date.now(),
        } as never)
      }),
    ).rejects.toThrow('resourceId')
  })
})
