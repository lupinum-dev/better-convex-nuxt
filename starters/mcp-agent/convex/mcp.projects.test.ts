import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  convexTest,
  mcpServerSecret,
  readRateLimitError,
  seedActor,
  seedHumanMember,
  serviceBearerHash,
  serviceBearerToken,
  setMcpServerSecret,
} from '../test/mcpTestHelpers'
import { api } from './_generated/api'
import schema from './schema'
import { modules } from './test.setup'

describe('mcp-agent project authorization and rate limits', () => {
  let restoreMcpServerSecret: () => void

  beforeEach(() => {
    restoreMcpServerSecret = setMcpServerSecret()
  })

  afterEach(() => {
    restoreMcpServerSecret()
  })

  it('service actor project functions fail closed when MCP_SERVER_SECRET is unset', async () => {
    restoreMcpServerSecret()
    delete process.env.MCP_SERVER_SECRET

    const t = convexTest(schema, modules)
    await seedActor(t, 'member')

    await expect(
      t.query(api.projects.listForServiceActor, {
        serverSecret: mcpServerSecret,
        bearerToken: serviceBearerToken,
      }),
    ).rejects.toThrow('MCP server is not configured securely')

    restoreMcpServerSecret = setMcpServerSecret()
  })

  it.each(['short', ` ${mcpServerSecret}`, `${mcpServerSecret} `])(
    'fails closed when the configured MCP_SERVER_SECRET is unsafe: %j',
    async (configuredSecret) => {
      restoreMcpServerSecret()
      process.env.MCP_SERVER_SECRET = configuredSecret

      const t = convexTest(schema, modules)
      await seedActor(t, 'member')

      await expect(
        t.query(api.projects.listForServiceActor, {
          serverSecret: configuredSecret,
          bearerToken: serviceBearerToken,
        }),
      ).rejects.toThrow('MCP server is not configured securely')

      restoreMcpServerSecret = setMcpServerSecret()
    },
  )

  it('service actor project functions require the MCP server secret', async () => {
    const t = convexTest(schema, modules)
    await seedActor(t, 'member')

    await expect(
      t.query(api.projects.listForServiceActor, {
        serverSecret: '',
        bearerToken: serviceBearerToken,
      }),
    ).rejects.toThrow('MCP server authorization required')
    await expect(
      t.mutation(api.projects.createFromServiceActor, {
        serverSecret: 'wrong-secret',
        bearerToken: serviceBearerToken,
        name: 'Blocked',
      }),
    ).rejects.toThrow('MCP server authorization required')
  })

  it('valid service actor can call server-authorized read tool function', async () => {
    const t = convexTest(schema, modules)
    await seedActor(t, 'viewer')

    const projects = await t.query(api.projects.listForServiceActor, {
      serverSecret: mcpServerSecret,
      bearerToken: serviceBearerToken,
    })

    expect(projects).toEqual([])
  })

  it('read-only service actor cannot call exposed write tool function', async () => {
    const t = convexTest(schema, modules)
    await seedActor(t, 'viewer')

    await expect(
      t.mutation(api.projects.createFromServiceActor, {
        serverSecret: mcpServerSecret,
        bearerToken: serviceBearerToken,
        name: 'Blocked',
      }),
    ).rejects.toThrow('Insufficient service actor role')
  })

  it('valid service actor can call exposed write tool function', async () => {
    const t = convexTest(schema, modules)
    const { serviceActorId } = await seedActor(t, 'member')

    const projectId = await t.mutation(api.projects.createFromServiceActor, {
      serverSecret: mcpServerSecret,
      bearerToken: serviceBearerToken,
      name: 'Launch',
    })

    expect(projectId).toBeTruthy()
    const project = await t.run(async (ctx) => await ctx.db.get(projectId))
    expect(project).toMatchObject({
      createdBy: { kind: 'serviceActor', serviceActorId },
    })
  })

  it('human project wrappers use the same project domain behavior', async () => {
    const t = convexTest(schema, modules)
    const { organizationId } = await seedActor(t, 'viewer')
    const userId = await seedHumanMember(t, organizationId, 'member', 'member')

    const projectId = await t
      .withIdentity({ subject: 'member' })
      .mutation(api.projects.createForCurrentUser, {
        organizationId,
        name: '  Launch  ',
      })
    const projects = await t
      .withIdentity({ subject: 'member' })
      .query(api.projects.listForCurrentUser, {
        organizationId,
      })
    const auditEvents = await t.run(async (ctx) => await ctx.db.query('auditEvents').collect())

    expect(projects).toHaveLength(1)
    expect(projects[0]).toMatchObject({
      _id: projectId,
      name: 'Launch',
      createdBy: { kind: 'user', userId },
    })
    expect(auditEvents).toContainEqual(
      expect.objectContaining({
        organizationId,
        actor: { kind: 'user', userId },
        action: 'projects.create',
        resourceType: 'project',
        source: 'human',
        resourceId: projectId,
      }),
    )
  })

  it('human project wrappers require active membership and member role for writes', async () => {
    const t = convexTest(schema, modules)
    const { organizationId } = await seedActor(t, 'viewer')
    await seedHumanMember(t, organizationId, 'viewer', 'viewer')
    await seedHumanMember(t, organizationId, 'removed', 'member', 'removed')

    await expect(
      t.withIdentity({ subject: 'viewer' }).mutation(api.projects.createForCurrentUser, {
        organizationId,
        name: 'Blocked',
      }),
    ).rejects.toThrow('Insufficient organization role')
    await expect(
      t.withIdentity({ subject: 'removed' }).query(api.projects.listForCurrentUser, {
        organizationId,
      }),
    ).rejects.toThrow('Insufficient organization role')
  })

  it('normalizes and bounds service actor project names before writing', async () => {
    const t = convexTest(schema, modules)
    const { serviceActorId } = await seedActor(t, 'member')

    const projectId = await t.mutation(api.projects.createFromServiceActor, {
      serverSecret: mcpServerSecret,
      bearerToken: serviceBearerToken,
      name: '  Launch  ',
    })
    await expect(
      t.mutation(api.projects.createFromServiceActor, {
        serverSecret: mcpServerSecret,
        bearerToken: serviceBearerToken,
        name: 'x'.repeat(121),
      }),
    ).rejects.toThrow('Project name is too long')

    const projects = await t.query(api.projects.listForServiceActor, {
      serverSecret: mcpServerSecret,
      bearerToken: serviceBearerToken,
    })
    expect(projects).toHaveLength(1)
    expect(projects[0]).toMatchObject({
      _id: projectId,
      name: 'Launch',
      createdBy: { kind: 'serviceActor', serviceActorId },
    })
  })

  it('service actor project writes stay in the credential organization', async () => {
    const t = convexTest(schema, modules)
    const { organizationId } = await seedActor(t, 'member')
    const otherOrganizationId = await t.run(async (ctx) => {
      return await ctx.db.insert('organizations', {
        name: 'Other',
        createdAt: Date.now(),
      })
    })

    await t.mutation(api.projects.createFromServiceActor, {
      serverSecret: mcpServerSecret,
      bearerToken: serviceBearerToken,
      name: 'Scoped',
    })

    const foreignProjects = await t.run(async (ctx) => {
      return await ctx.db
        .query('projects')
        .withIndex('by_org_status', (q) =>
          q.eq('organizationId', otherOrganizationId).eq('status', 'active'),
        )
        .collect()
    })
    const credentialProjects = await t.query(api.projects.listForServiceActor, {
      serverSecret: mcpServerSecret,
      bearerToken: serviceBearerToken,
    })

    expect(foreignProjects).toEqual([])
    expect(credentialProjects.map((project) => project.organizationId)).toEqual([organizationId])
  })

  it('Convex re-checks changed actor role at execution time', async () => {
    const t = convexTest(schema, modules)
    const { serviceActorId } = await seedActor(t, 'member')

    await t.run(async (ctx) => {
      await ctx.db.patch(serviceActorId, { role: 'viewer' })
    })

    await expect(
      t.mutation(api.projects.createFromServiceActor, {
        serverSecret: mcpServerSecret,
        bearerToken: serviceBearerToken,
        name: 'Blocked',
      }),
    ).rejects.toThrow('Insufficient service actor role')
  })

  it('rate limits repeated human project creation per organization member', async () => {
    const t = convexTest(schema, modules)
    const { organizationId } = await seedActor(t, 'viewer')
    await seedHumanMember(t, organizationId, 'member', 'member')

    for (let index = 0; index < 10; index += 1) {
      await t.withIdentity({ subject: 'member' }).mutation(api.projects.createForCurrentUser, {
        organizationId,
        name: `Human ${index}`,
      })
    }

    let error: unknown
    try {
      await t.withIdentity({ subject: 'member' }).mutation(api.projects.createForCurrentUser, {
        organizationId,
        name: 'Blocked human',
      })
    } catch (caught) {
      error = caught
    }

    expect(readRateLimitError(error)).toMatchObject({
      kind: 'RateLimited',
      name: 'humanProjectCreate',
    })

    const projects = await t
      .withIdentity({ subject: 'member' })
      .query(api.projects.listForCurrentUser, {
        organizationId,
      })
    expect(projects).toHaveLength(10)
  })

  it('rate limits repeated service actor project creation per organization actor', async () => {
    const t = convexTest(schema, modules)
    await seedActor(t, 'member')

    for (let index = 0; index < 5; index += 1) {
      await t.mutation(api.projects.createFromServiceActor, {
        serverSecret: mcpServerSecret,
        bearerToken: serviceBearerToken,
        name: `Actor ${index}`,
      })
    }

    let error: unknown
    try {
      await t.mutation(api.projects.createFromServiceActor, {
        serverSecret: mcpServerSecret,
        bearerToken: serviceBearerToken,
        name: 'Blocked actor',
      })
    } catch (caught) {
      error = caught
    }

    expect(readRateLimitError(error)).toMatchObject({
      kind: 'RateLimited',
      name: 'serviceActorProjectCreate',
    })

    const projects = await t.query(api.projects.listForServiceActor, {
      serverSecret: mcpServerSecret,
      bearerToken: serviceBearerToken,
    })
    expect(projects).toHaveLength(5)
  })

  it('revoked credential fails', async () => {
    const t = convexTest(schema, modules)
    await seedActor(t, 'member')
    await t.run(async (ctx) => {
      const credential = await ctx.db
        .query('agentCredentials')
        .withIndex('by_secret_hash', (q) => q.eq('secretHash', serviceBearerHash))
        .unique()
      await ctx.db.patch(credential!._id, { status: 'revoked', revokedAt: Date.now() })
    })

    await expect(
      t.query(api.projects.listForServiceActor, {
        serverSecret: mcpServerSecret,
        bearerToken: serviceBearerToken,
      }),
    ).rejects.toThrow('Service actor credential denied')
  })
})
