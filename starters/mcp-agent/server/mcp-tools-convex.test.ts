import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import schema from '../convex/schema'
import { modules } from '../convex/test.setup'
import {
  createCreateProjectTool,
  createListProjectsTool,
  hashBearerSecret,
} from './utils/mcpProjectTools'

type TestConvex = ReturnType<typeof convexTest>

async function seedServiceActor(t: TestConvex, role: 'member' | 'viewer') {
  return await t.run(async (ctx) => {
    const organizationId = await ctx.db.insert('organizations', {
      name: 'Acme',
      createdAt: Date.now(),
    })
    const serviceActorId = await ctx.db.insert('serviceActors', {
      organizationId,
      name: 'MCP',
      role,
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    await ctx.db.insert('agentCredentials', {
      organizationId,
      serviceActorId,
      secretHash: hashBearerSecret('proof-token'),
      status: 'active',
      createdAt: Date.now(),
    })
    return { organizationId, serviceActorId }
  })
}

function createTools(t: TestConvex) {
  const args = {
    getClient: () => ({
      query: (query, args) => t.query(query, args),
      mutation: (mutation, args) => t.mutation(mutation, args),
    }),
  }
  return {
    listProjects: createListProjectsTool(args),
    createProject: createCreateProjectTool(args),
  }
}

function mcpExtra(token = 'proof-token') {
  return {
    requestInfo: {
      headers: new Headers({ authorization: `Bearer ${token}` }),
    },
  }
}

describe('MCP project tool adapters with Convex functions', () => {
  it('hashes MCP bearer metadata and reads through the real Convex query', async () => {
    const t = convexTest(schema, modules)
    const { organizationId } = await seedServiceActor(t, 'viewer')
    const { listProjects } = createTools(t)

    const result = await listProjects.handler({ organizationId }, mcpExtra())

    expect(result.content).toEqual([{ type: 'text', text: '[]' }])
  })

  it('hashes MCP bearer metadata and writes through the real Convex mutation', async () => {
    const t = convexTest(schema, modules)
    const { organizationId } = await seedServiceActor(t, 'member')
    const { createProject } = createTools(t)

    const result = await createProject.handler(
      { organizationId, name: '  Launch  ' },
      mcpExtra(),
    )

    expect(result.content[0]?.text).toContain('Created project')

    const projects = await t.query(api.projects.listForServiceActor, {
      credentialHash: hashBearerSecret('proof-token'),
      organizationId,
    })
    expect(projects).toHaveLength(1)
    expect(projects[0]?.name).toBe('Launch')
  })

  it('does not let MCP tool input create overlong project names', async () => {
    const t = convexTest(schema, modules)
    const { organizationId } = await seedServiceActor(t, 'member')
    const { createProject } = createTools(t)

    await expect(
      createProject.handler(
        { organizationId, name: 'x'.repeat(121) },
        mcpExtra(),
      ),
    ).rejects.toThrow('Project name is too long')

    const projects = await t.query(api.projects.listForServiceActor, {
      credentialHash: hashBearerSecret('proof-token'),
      organizationId,
    })
    expect(projects).toEqual([])
  })

  it('does not bypass Convex authorization when MCP metadata is valid', async () => {
    const t = convexTest(schema, modules)
    const { organizationId } = await seedServiceActor(t, 'viewer')
    const { createProject } = createTools(t)

    await expect(
      createProject.handler({ organizationId, name: 'Blocked' }, mcpExtra()),
    ).rejects.toThrow('Insufficient service actor role')
  })

  it('does not let MCP tool args retarget another organization', async () => {
    const t = convexTest(schema, modules)
    await seedServiceActor(t, 'member')
    const otherOrganizationId = await t.run(async (ctx) => {
      return await ctx.db.insert('organizations', {
        name: 'Other',
        createdAt: Date.now(),
      })
    })
    const { createProject } = createTools(t)

    await expect(
      createProject.handler(
        { organizationId: otherOrganizationId as Id<'organizations'>, name: 'Blocked' },
        mcpExtra(),
      ),
    ).rejects.toThrow('Service actor credential denied')
  })
})
