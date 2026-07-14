import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import schema from '../convex/schema'
import { initConvexTest, modules } from '../convex/test.setup'
import {
  createCreateProjectTool,
  createExecuteDeleteProjectTool,
  createGetApprovalTool,
  createListProjectsTool,
  createPreviewCreateProjectTool,
  createPreviewDeleteProjectTool,
  createProjectToolClient,
  createRequestDeleteProjectApprovalTool,
  hashBearerSecret,
} from './utils/mcpProjectTools'

const proofServerSecret = 'mcp-agent-local-proof-server-secret-1234'

describe('MCP Convex client boundary', () => {
  it.each([
    'https://user:password@example.convex.cloud',
    'https://example.convex.cloud/path',
    'https://example.convex.cloud?redirect=https://evil.example',
    'https://example.convex.cloud#fragment',
    'http://example.convex.cloud',
    'file:///tmp/convex',
  ])('rejects credential-unsafe Convex URL %s before client construction', (url) => {
    expect(() => createProjectToolClient(url)).toThrow(
      /Convex URL (?:is invalid|must be one credential-free HTTPS origin)/,
    )
  })

  it.each([
    'https://example.convex.cloud',
    'http://127.0.0.1:3210',
    'http://[::1]:3210',
    'http://worker.localhost:3210',
  ])('accepts exact HTTPS and loopback origins %s', (url) => {
    expect(() => createProjectToolClient(url)).not.toThrow()
  })
})

function convexTest(_schema = schema, _modules = modules) {
  return initConvexTest()
}

type TestConvex = ReturnType<typeof initConvexTest>

async function seedServiceActor(t: TestConvex, role: 'admin' | 'member' | 'viewer') {
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

function createTools(t: TestConvex, getServerSecret = () => proofServerSecret) {
  const args = {
    getClient: () => ({
      query: (query, args) => t.query(query, args),
      mutation: (mutation, args) => t.mutation(mutation, args),
    }),
    getServerSecret,
  }
  return {
    listProjects: createListProjectsTool(args),
    previewCreateProject: createPreviewCreateProjectTool(args),
    createProject: createCreateProjectTool(args),
    previewDeleteProject: createPreviewDeleteProjectTool(args),
    requestDeleteProjectApproval: createRequestDeleteProjectApprovalTool(args),
    executeDeleteProject: createExecuteDeleteProjectTool(args),
    getApproval: createGetApprovalTool(args),
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
  let previousMcpServerSecret: string | undefined

  beforeEach(() => {
    previousMcpServerSecret = process.env.MCP_SERVER_SECRET
    process.env.MCP_SERVER_SECRET = proofServerSecret
  })

  afterEach(() => {
    if (previousMcpServerSecret === undefined) {
      delete process.env.MCP_SERVER_SECRET
    } else {
      process.env.MCP_SERVER_SECRET = previousMcpServerSecret
    }
  })

  it('hashes MCP bearer metadata and reads through the real Convex query', async () => {
    const t = convexTest(schema, modules)
    await seedServiceActor(t, 'viewer')
    const { listProjects } = createTools(t)

    const result = await listProjects.handler({}, mcpExtra())

    expect(result.content).toEqual([{ type: 'text', text: '[]' }])
  })

  it.each(['', 'short', ` ${proofServerSecret}`, `${proofServerSecret} `])(
    'rejects an unsafe server-side MCP secret before calling Convex: %j',
    async (configuredSecret) => {
      const t = convexTest(schema, modules)
      await seedServiceActor(t, 'viewer')
      const { listProjects } = createTools(t, () => configuredSecret)

      await expect(listProjects.handler({}, mcpExtra())).rejects.toThrow(
        'MCP_SERVER_SECRET must be at least 32 characters with no surrounding space',
      )
    },
  )

  it('hashes MCP bearer metadata and writes through the real Convex mutation', async () => {
    const t = convexTest(schema, modules)
    await seedServiceActor(t, 'member')
    const { createProject } = createTools(t)

    const result = await createProject.handler({ name: '  Launch  ' }, mcpExtra())

    expect(result.content[0]?.text).toContain('Created project')

    const projects = await t.query(api.projects.listForServiceActor, {
      serverSecret: proofServerSecret,
      bearerToken: 'proof-token',
    })
    expect(projects).toHaveLength(1)
    expect(projects[0]?.name).toBe('Launch')
  })

  it('previews project creation without writing through Convex', async () => {
    const t = convexTest(schema, modules)
    await seedServiceActor(t, 'member')
    const { previewCreateProject } = createTools(t)

    const result = await previewCreateProject.handler({ name: '  Launch  ' }, mcpExtra())
    const projects = await t.query(api.projects.listForServiceActor, {
      serverSecret: proofServerSecret,
      bearerToken: 'proof-token',
    })

    expect(result.content[0]?.text).toContain('"operation": "projects.create"')
    expect(result.content[0]?.text).toContain('"requiresApproval": false')
    expect(result.content[0]?.text).toContain('"name": "Launch"')
    expect(projects).toEqual([])
  })

  it('does not let MCP tool input create overlong project names', async () => {
    const t = convexTest(schema, modules)
    await seedServiceActor(t, 'member')
    const { createProject } = createTools(t)

    await expect(createProject.handler({ name: 'x'.repeat(121) }, mcpExtra())).rejects.toThrow(
      'Project name is too long',
    )

    const projects = await t.query(api.projects.listForServiceActor, {
      serverSecret: proofServerSecret,
      bearerToken: 'proof-token',
    })
    expect(projects).toEqual([])
  })

  it('uses the shared project validation message for blank MCP input', async () => {
    const t = convexTest(schema, modules)
    await seedServiceActor(t, 'member')
    const { createProject } = createTools(t)

    await expect(createProject.handler({ name: '   ' }, mcpExtra())).rejects.toThrow(
      'Project name is required',
    )
  })

  it('does not bypass Convex authorization when MCP metadata is valid', async () => {
    const t = convexTest(schema, modules)
    await seedServiceActor(t, 'viewer')
    const { createProject } = createTools(t)

    await expect(createProject.handler({ name: 'Blocked' }, mcpExtra())).rejects.toThrow(
      'Insufficient service actor role',
    )
  })

  it('creates projects only in the credential organization', async () => {
    const t = convexTest(schema, modules)
    const { organizationId } = await seedServiceActor(t, 'member')
    const foreignOrganizationId = await t.run(async (ctx) => {
      return await ctx.db.insert('organizations', {
        name: 'Other',
        createdAt: Date.now(),
      })
    })
    const { createProject } = createTools(t)

    await createProject.handler({ name: 'Scoped' }, mcpExtra())

    const foreignProjects = await t.run(async (ctx) => {
      return await ctx.db
        .query('projects')
        .withIndex('by_org_status', (q) =>
          q.eq('organizationId', foreignOrganizationId).eq('status', 'active'),
        )
        .collect()
    })
    const credentialProjects = await t.query(api.projects.listForServiceActor, {
      serverSecret: proofServerSecret,
      bearerToken: 'proof-token',
    })

    expect(foreignProjects).toEqual([])
    expect(credentialProjects.map((project) => project.organizationId)).toEqual([organizationId])
  })

  it('previews, requests, and reads project delete approvals through Convex', async () => {
    const t = convexTest(schema, modules)
    const { organizationId, serviceActorId } = await seedServiceActor(t, 'admin')
    const { previewDeleteProject, requestDeleteProjectApproval, getApproval } = createTools(t)
    const projectId = await t.run(async (ctx) => {
      return await ctx.db.insert('projects', {
        organizationId,
        name: 'Preview Me',
        createdBy: { kind: 'serviceActor', serviceActorId },
        status: 'active',
        createdAt: Date.now(),
      })
    })

    const preview = await previewDeleteProject.handler({ projectId }, mcpExtra())
    expect(preview.content[0]?.text).toContain('"requiresApproval": true')
    expect(preview.content[0]?.text).toContain('projects.delete.requestApproval')

    const request = await requestDeleteProjectApproval.handler(
      {
        projectId,
        reason: 'User asked through MCP.',
        requestKey: 'adapter-request-1',
      },
      mcpExtra(),
    )
    const parsedRequest = JSON.parse(request.content[0]!.text) as { approvalRequestId: string }
    expect(request.content[0]?.text).toContain('"status": "waiting_for_approval"')

    const approval = await getApproval.handler(
      { approvalRequestId: parsedRequest.approvalRequestId },
      mcpExtra(),
    )
    expect(approval.content[0]?.text).toContain('"status": "pending"')
  })

  it('deletes projects only through the approved Convex destructive path', async () => {
    const t = convexTest(schema, modules)
    const { organizationId, serviceActorId } = await seedServiceActor(t, 'admin')
    const { executeDeleteProject } = createTools(t)
    const { projectId, approvalId } = await t.run(async (ctx) => {
      const approvedBy = await ctx.db.insert('users', {
        subject: 'owner-subject',
        name: 'Owner',
        email: 'owner@example.com',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      const projectId = await ctx.db.insert('projects', {
        organizationId,
        name: 'Delete Me',
        createdBy: { kind: 'serviceActor', serviceActorId },
        status: 'active',
        createdAt: Date.now(),
      })
      const approvalId = await ctx.db.insert('approvals', {
        organizationId,
        operation: 'projects.delete',
        resourceId: projectId,
        status: 'approved',
        requestedBy: serviceActorId,
        approvedBy,
        expiresAt: Date.now() + 60_000,
        createdAt: Date.now(),
      })
      return { projectId, approvalId }
    })

    const result = await executeDeleteProject.handler(
      {
        projectId,
        approvalId,
      },
      mcpExtra(),
    )

    expect(result.content[0]?.text).toContain('"status": "executed"')

    const deletedProject = await t.run(async (ctx) => await ctx.db.get(projectId as Id<'projects'>))
    const usedApproval = await t.run(async (ctx) => await ctx.db.get(approvalId as Id<'approvals'>))
    expect(deletedProject).toMatchObject({ status: 'deleted' })
    expect(usedApproval).toMatchObject({ status: 'used' })
  })

  it('does not bypass approval checks for destructive MCP tools', async () => {
    const t = convexTest(schema, modules)
    const { organizationId, serviceActorId } = await seedServiceActor(t, 'admin')
    const { executeDeleteProject } = createTools(t)
    const { projectId, mismatchedApprovalId } = await t.run(async (ctx) => {
      const approvedBy = await ctx.db.insert('users', {
        subject: 'admin-subject',
        name: 'Admin',
        email: 'admin@example.com',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      const projectId = await ctx.db.insert('projects', {
        organizationId,
        name: 'Still Here',
        createdBy: { kind: 'serviceActor', serviceActorId },
        status: 'active',
        createdAt: Date.now(),
      })
      const otherProjectId = await ctx.db.insert('projects', {
        organizationId,
        name: 'Other Project',
        createdBy: { kind: 'serviceActor', serviceActorId },
        status: 'active',
        createdAt: Date.now(),
      })
      const mismatchedApprovalId = await ctx.db.insert('approvals', {
        organizationId,
        operation: 'projects.delete',
        resourceId: otherProjectId,
        status: 'approved',
        requestedBy: serviceActorId,
        approvedBy,
        expiresAt: Date.now() + 60_000,
        createdAt: Date.now(),
      })
      return { projectId, mismatchedApprovalId }
    })

    await expect(
      executeDeleteProject.handler(
        {
          projectId,
          approvalId: mismatchedApprovalId,
        },
        mcpExtra(),
      ),
    ).rejects.toThrow('Approval required')
  })

  it('rejects destructive MCP calls without an approval id before Convex execution', async () => {
    const t = convexTest(schema, modules)
    const { executeDeleteProject } = createTools(t)

    await expect(
      executeDeleteProject.handler(
        {
          projectId: 'project-1',
        },
        mcpExtra(),
      ),
    ).rejects.toThrow('Approval id is required')
  })
})
