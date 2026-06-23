import { existsSync, readFileSync } from 'node:fs'

import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'
import { modules } from './test.setup'

const validCredentialHash = 'a'.repeat(64)
const otherCredentialHash = 'b'.repeat(64)

async function seedActor(
  t: ReturnType<typeof convexTest>,
  role: 'admin' | 'member' | 'viewer',
  status: 'active' | 'revoked' = 'active',
) {
  return await t.run(async (ctx) => {
    const organizationId = await ctx.db.insert('organizations', {
      name: 'Acme',
      createdAt: Date.now(),
    })
    const serviceActorId = await ctx.db.insert('serviceActors', {
      organizationId,
      name: 'MCP',
      role,
      status,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    const credentialId = await ctx.db.insert('agentCredentials', {
      organizationId,
      serviceActorId,
      secretHash: 'hash',
      status: 'active',
      createdAt: Date.now(),
    })
    return { organizationId, serviceActorId, credentialId }
  })
}

async function seedHumanMember(
  t: ReturnType<typeof convexTest>,
  organizationId: Id<'organizations'>,
  subject: string,
  role: 'owner' | 'admin' | 'member' | 'viewer',
  status: 'active' | 'removed' = 'active',
) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', {
      subject,
      name: subject,
      email: `${subject}@example.com`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    await ctx.db.insert('memberships', {
      organizationId,
      userId,
      role,
      status,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    return userId
  })
}

describe('mcp-agent starter invariants', () => {
  it('keeps approval and service audit labels schema-bounded', () => {
    const source = readFileSync(new URL('./schema.ts', import.meta.url), 'utf8')

    expect(source).toContain("export const approvalOperationValidator = v.literal('projects.delete')")
    expect(source).toContain('export const serviceAuditActionValidator = v.union(')
    expect(source).toContain("v.literal('projects.create')")
    expect(source).toContain("v.literal('projects.delete')")
    expect(source).toContain("export const serviceAuditResourceTypeValidator = v.literal('project')")
    expect(source).toContain('export const projectCreatorValidator = v.union(')
    expect(source).toContain('export const serviceActorRoleValidator = v.union(')
    expect(source).toContain('role: serviceActorRoleValidator')
    expect(source).toContain('operation: approvalOperationValidator')
    expect(source).toContain('action: serviceAuditActionValidator')
    expect(source).toContain('resourceType: serviceAuditResourceTypeValidator')
    expect(source).toContain('createdBy: projectCreatorValidator')
    expect(source).not.toContain('createdByServiceActorId')
    expect(source).not.toContain("v.literal('pending')")
    expect(source).not.toContain("v.literal('denied')")
  })

  it('does not let service actors use the human owner role', async () => {
    const t = convexTest(schema, modules)
    const { organizationId } = await seedActor(t, 'viewer')
    await seedHumanMember(t, organizationId, 'owner', 'owner')

    await expect(
      t.withIdentity({ subject: 'owner' }).mutation(api.serviceActors.create, {
        organizationId,
        name: 'Owner Agent',
        role: 'owner' as never,
        credentialHash: validCredentialHash,
      }),
    ).rejects.toThrow()

    const serviceActors = await t.run(async (ctx) => {
      return await ctx.db
        .query('serviceActors')
        .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
        .collect()
    })
    expect(serviceActors.map((actor) => actor.role)).toEqual(['viewer'])
  })

  it('does not keep an unauthenticated demo service actor minting path', () => {
    const source = readFileSync(new URL('./serviceActors.ts', import.meta.url), 'utf8')

    expect(source).not.toContain('createForDemo')
    expect(source).toContain('requireServiceCredentialManager')
  })

  it('does not keep an unauthenticated demo approval path', () => {
    const source = readFileSync(new URL('./approvals.ts', import.meta.url), 'utf8')

    expect(source).not.toContain('createApprovedForDemo')
    expect(source).not.toContain('operation: v.string()')
    expect(source).not.toContain('resourceId: v.string()')
    expect(source).toContain('requireOrganizationAdmin')
    expect(source).toContain("operation: 'projects.delete'")
  })

  it('does not keep a caller-supplied fake agent usage action', () => {
    expect(existsSync(new URL('./agents.ts', import.meta.url))).toBe(false)
  })

  it('requires organization membership for organization reads', async () => {
    const t = convexTest(schema, modules)
    const { organizationId } = await seedActor(t, 'viewer')
    await seedHumanMember(t, organizationId, 'member', 'member')
    await seedHumanMember(t, organizationId, 'removed', 'member', 'removed')
    await seedHumanMember(t, organizationId, 'outsider', 'member')
    const otherOrganizationId = await t.run(async (ctx) => {
      return await ctx.db.insert('organizations', {
        name: 'Other',
        createdAt: Date.now(),
      })
    })

    await expect(
      t.withIdentity({ subject: 'removed' }).query(api.organizations.get, {
        organizationId,
      }),
    ).rejects.toThrow('Insufficient organization role')
    await expect(
      t.withIdentity({ subject: 'outsider' }).query(api.organizations.get, {
        organizationId: otherOrganizationId,
      }),
    ).rejects.toThrow('Insufficient organization role')

    const organization = await t.withIdentity({ subject: 'member' }).query(api.organizations.get, {
      organizationId,
    })
    expect(organization).toMatchObject({ name: 'Acme' })
  })

  it('requires organization admin for membership listing', async () => {
    const t = convexTest(schema, modules)
    const { organizationId } = await seedActor(t, 'viewer')
    await seedHumanMember(t, organizationId, 'member', 'member')
    await seedHumanMember(t, organizationId, 'admin', 'admin')

    await expect(
      t.withIdentity({ subject: 'member' }).query(api.memberships.listForOrganization, {
        organizationId,
      }),
    ).rejects.toThrow('Insufficient organization role')

    const memberships = await t.withIdentity({ subject: 'admin' }).query(api.memberships.listForOrganization, {
      organizationId,
    })
    expect(memberships).toHaveLength(2)
  })

  it('lists only active organizations for the current user', async () => {
    const t = convexTest(schema, modules)
    const { organizationId } = await seedActor(t, 'viewer')
    const otherOrganizationId = await t.run(async (ctx) => {
      return await ctx.db.insert('organizations', {
        name: 'Other',
        createdAt: Date.now(),
      })
    })
    await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', {
        subject: 'member',
        name: 'member',
        email: 'member@example.com',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      await ctx.db.insert('memberships', {
        organizationId,
        userId,
        role: 'member',
        status: 'active',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      await ctx.db.insert('memberships', {
        organizationId: otherOrganizationId,
        userId,
        role: 'member',
        status: 'removed',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })

    const organizations = await t.withIdentity({ subject: 'member' }).query(api.organizations.listMine, {})

    expect(organizations).toEqual([
      expect.objectContaining({
        id: organizationId,
        name: 'Acme',
        role: 'member',
      }),
    ])
  })

  it('lists service actors for admins without leaking credential hashes', async () => {
    const t = convexTest(schema, modules)
    const { organizationId, serviceActorId } = await seedActor(t, 'viewer')
    await seedHumanMember(t, organizationId, 'member', 'member')
    await seedHumanMember(t, organizationId, 'admin', 'admin')

    await expect(
      t.withIdentity({ subject: 'member' }).query(api.serviceActors.listForOrganization, {
        organizationId,
      }),
    ).rejects.toThrow('Insufficient organization role')

    const actors = await t.withIdentity({ subject: 'admin' }).query(api.serviceActors.listForOrganization, {
      organizationId,
    })

    expect(actors).toEqual([
      expect.objectContaining({
        id: serviceActorId,
        name: 'MCP',
        role: 'viewer',
        status: 'active',
      }),
    ])
    expect(JSON.stringify(actors)).not.toContain('hash')
    expect(JSON.stringify(actors)).not.toContain('secretHash')
  })

  it('valid service actor can call exposed read tool function', async () => {
    const t = convexTest(schema, modules)
    const { organizationId } = await seedActor(t, 'viewer')

    const projects = await t.query(api.projects.listForServiceActor, {
      credentialHash: 'hash',
      organizationId,
    })

    expect(projects).toEqual([])
  })

  it('read-only service actor cannot call exposed write tool function', async () => {
    const t = convexTest(schema, modules)
    const { organizationId } = await seedActor(t, 'viewer')

    await expect(
      t.mutation(api.projects.createFromServiceActor, {
        credentialHash: 'hash',
        organizationId,
        name: 'Blocked',
      }),
    ).rejects.toThrow('Insufficient service actor role')
  })

  it('valid service actor can call exposed write tool function', async () => {
    const t = convexTest(schema, modules)
    const { organizationId, serviceActorId } = await seedActor(t, 'member')

    const projectId = await t.mutation(api.projects.createFromServiceActor, {
      credentialHash: 'hash',
      organizationId,
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

    const projectId = await t.withIdentity({ subject: 'member' }).mutation(api.projects.createForCurrentUser, {
      organizationId,
      name: '  Launch  ',
    })
    const projects = await t.withIdentity({ subject: 'member' }).query(api.projects.listForCurrentUser, {
      organizationId,
    })

    expect(projects).toHaveLength(1)
    expect(projects[0]).toMatchObject({
      _id: projectId,
      name: 'Launch',
      createdBy: { kind: 'user', userId },
    })
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
    const { organizationId, serviceActorId } = await seedActor(t, 'member')

    const projectId = await t.mutation(api.projects.createFromServiceActor, {
      credentialHash: 'hash',
      organizationId,
      name: '  Launch  ',
    })
    await expect(
      t.mutation(api.projects.createFromServiceActor, {
        credentialHash: 'hash',
        organizationId,
        name: 'x'.repeat(121),
      }),
    ).rejects.toThrow('Project name is too long')

    const projects = await t.query(api.projects.listForServiceActor, {
      credentialHash: 'hash',
      organizationId,
    })
    expect(projects).toHaveLength(1)
    expect(projects[0]).toMatchObject({
      _id: projectId,
      name: 'Launch',
      createdBy: { kind: 'serviceActor', serviceActorId },
    })
  })

  it('revoked credential fails', async () => {
    const t = convexTest(schema, modules)
    const { organizationId } = await seedActor(t, 'member')
    await t.run(async (ctx) => {
      const credential = await ctx.db
        .query('agentCredentials')
        .withIndex('by_secret_hash', (q) => q.eq('secretHash', 'hash'))
        .unique()
      await ctx.db.patch(credential!._id, { status: 'revoked', revokedAt: Date.now() })
    })

    await expect(
      t.query(api.projects.listForServiceActor, {
        credentialHash: 'hash',
        organizationId,
      }),
    ).rejects.toThrow('Service actor credential denied')
  })

  it('only an active organization admin can revoke a service actor credential', async () => {
    const t = convexTest(schema, modules)
    const { organizationId, credentialId } = await seedActor(t, 'member')
    await seedHumanMember(t, organizationId, 'member', 'member')
    await seedHumanMember(t, organizationId, 'admin', 'admin')

    await expect(
      t.withIdentity({ subject: 'member' }).mutation(api.agentCredentials.revoke, {
        credentialId,
      }),
    ).rejects.toThrow('Insufficient organization role')

    await t.withIdentity({ subject: 'admin' }).mutation(api.agentCredentials.revoke, {
      credentialId,
    })

    const credential = await t.run(async (ctx) => await ctx.db.get(credentialId))
    expect(credential).toMatchObject({ status: 'revoked' })
    expect(credential?.revokedAt).toEqual(expect.any(Number))
  })

  it('does not let another organization admin revoke a service actor credential', async () => {
    const t = convexTest(schema, modules)
    const { credentialId } = await seedActor(t, 'member')
    const otherOrganizationId = await t.run(async (ctx) => {
      return await ctx.db.insert('organizations', {
        name: 'Other',
        createdAt: Date.now(),
      })
    })
    await seedHumanMember(t, otherOrganizationId, 'other-admin', 'admin')

    await expect(
      t.withIdentity({ subject: 'other-admin' }).mutation(api.agentCredentials.revoke, {
        credentialId,
      }),
    ).rejects.toThrow('Insufficient organization role')

    const credential = await t.run(async (ctx) => await ctx.db.get(credentialId))
    expect(credential).toMatchObject({ status: 'active' })
  })

  it('only an active organization admin can create service actors and credentials', async () => {
    const t = convexTest(schema, modules)
    const { organizationId } = await seedActor(t, 'viewer')
    await seedHumanMember(t, organizationId, 'member', 'member')
    await seedHumanMember(t, organizationId, 'owner', 'owner')

    await expect(
      t.withIdentity({ subject: 'member' }).mutation(api.serviceActors.create, {
        organizationId,
        name: 'Blocked',
        role: 'member',
        credentialHash: 'blocked-hash',
      }),
    ).rejects.toThrow('Insufficient organization role')

    const serviceActorId = await t.withIdentity({ subject: 'owner' }).mutation(api.serviceActors.create, {
      organizationId,
      name: '  Build Agent  ',
      role: 'member',
      credentialHash: `  ${validCredentialHash}  `,
    })

    const { actor, credential } = await t.run(async (ctx) => {
      const actor = await ctx.db.get(serviceActorId)
      const credential = await ctx.db
        .query('agentCredentials')
        .withIndex('by_actor', (q) => q.eq('serviceActorId', serviceActorId))
        .unique()
      return { actor, credential }
    })
    expect(actor).toMatchObject({
      organizationId,
      name: 'Build Agent',
      role: 'member',
      status: 'active',
    })
    expect(credential).toMatchObject({
      organizationId,
      serviceActorId,
      secretHash: validCredentialHash,
      status: 'active',
    })
  })

  it('does not let another organization admin create service actors', async () => {
    const t = convexTest(schema, modules)
    const { organizationId } = await seedActor(t, 'viewer')
    const otherOrganizationId = await t.run(async (ctx) => {
      return await ctx.db.insert('organizations', {
        name: 'Other',
        createdAt: Date.now(),
      })
    })
    await seedHumanMember(t, otherOrganizationId, 'other-admin', 'admin')

    await expect(
      t.withIdentity({ subject: 'other-admin' }).mutation(api.serviceActors.create, {
        organizationId,
        name: 'Blocked',
        role: 'member',
        credentialHash: 'blocked-hash',
      }),
    ).rejects.toThrow('Insufficient organization role')

    const serviceActors = await t.run(async (ctx) => {
      return await ctx.db
        .query('serviceActors')
        .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
        .collect()
    })
    expect(serviceActors).toHaveLength(1)
  })

  it('rejects blank service actor names and credential hashes before writing', async () => {
    const t = convexTest(schema, modules)
    const { organizationId } = await seedActor(t, 'viewer')
    await seedHumanMember(t, organizationId, 'admin', 'admin')

    await expect(
      t.withIdentity({ subject: 'admin' }).mutation(api.serviceActors.create, {
        organizationId,
        name: '   ',
        role: 'member',
        credentialHash: 'hash',
      }),
    ).rejects.toThrow('Service actor name is required')
    await expect(
      t.withIdentity({ subject: 'admin' }).mutation(api.serviceActors.create, {
        organizationId,
        name: 'Build Agent',
        role: 'member',
        credentialHash: '   ',
      }),
    ).rejects.toThrow('Credential hash is required')

    const serviceActors = await t.run(async (ctx) => {
      return await ctx.db
        .query('serviceActors')
        .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
        .collect()
    })
    expect(serviceActors.map((actor) => actor.name)).toEqual(['MCP'])
  })

  it('rejects malformed service actor credential hashes before writing', async () => {
    const t = convexTest(schema, modules)
    const { organizationId } = await seedActor(t, 'viewer')
    await seedHumanMember(t, organizationId, 'admin', 'admin')

    await expect(
      t.withIdentity({ subject: 'admin' }).mutation(api.serviceActors.create, {
        organizationId,
        name: 'Build Agent',
        role: 'member',
        credentialHash: 'not-a-sha256-digest',
      }),
    ).rejects.toThrow('Credential hash must be a SHA-256 hex digest')

    const serviceActors = await t.run(async (ctx) => {
      return await ctx.db
        .query('serviceActors')
        .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
        .collect()
    })
    expect(serviceActors.map((actor) => actor.name)).toEqual(['MCP'])
  })

  it('rejects duplicate service actor credential hashes before writing', async () => {
    const t = convexTest(schema, modules)
    const { organizationId } = await seedActor(t, 'viewer')
    await seedHumanMember(t, organizationId, 'admin', 'admin')

    await t.withIdentity({ subject: 'admin' }).mutation(api.serviceActors.create, {
      organizationId,
      name: 'Build Agent',
      role: 'member',
      credentialHash: otherCredentialHash,
    })
    await expect(
      t.withIdentity({ subject: 'admin' }).mutation(api.serviceActors.create, {
        organizationId,
        name: 'Duplicate Agent',
        role: 'member',
        credentialHash: otherCredentialHash,
      }),
    ).rejects.toThrow('Credential hash already exists')

    const serviceActors = await t.run(async (ctx) => {
      return await ctx.db
        .query('serviceActors')
        .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
        .collect()
    })
    expect(serviceActors.map((actor) => actor.name).sort()).toEqual(['Build Agent', 'MCP'])
  })

  it('tool args cannot target another organization', async () => {
    const t = convexTest(schema, modules)
    await seedActor(t, 'member')
    const otherOrganizationId = await t.run(async (ctx) => {
      return await ctx.db.insert('organizations', {
        name: 'Other',
        createdAt: Date.now(),
      })
    })

    await expect(
      t.mutation(api.projects.createFromServiceActor, {
        credentialHash: 'hash',
        organizationId: otherOrganizationId,
        name: 'Blocked',
      }),
    ).rejects.toThrow('Service actor credential denied')
  })

  it('Convex re-checks changed actor role at execution time', async () => {
    const t = convexTest(schema, modules)
    const { organizationId, serviceActorId } = await seedActor(t, 'member')

    await t.run(async (ctx) => {
      await ctx.db.patch(serviceActorId, { role: 'viewer' })
    })

    await expect(
      t.mutation(api.projects.createFromServiceActor, {
        credentialHash: 'hash',
        organizationId,
        name: 'Blocked',
      }),
    ).rejects.toThrow('Insufficient service actor role')
  })

  it('sensitive write requires approval', async () => {
    const t = convexTest(schema, modules)
    const { organizationId } = await seedActor(t, 'admin')
    const ownerId = await seedHumanMember(t, organizationId, 'owner', 'owner')
    const projectId = await t.mutation(api.projects.createFromServiceActor, {
      credentialHash: 'hash',
      organizationId,
      name: 'Delete me',
    })

    const approvalId = await t.run(async (ctx) => {
      return await ctx.db.insert('approvals', {
        organizationId,
        operation: 'projects.delete',
        resourceId: projectId,
        status: 'used',
        approvedBy: ownerId,
        expiresAt: Date.now() + 60_000,
        createdAt: Date.now(),
        usedAt: Date.now(),
      })
    })

    await expect(
      t.mutation(api.projects.deleteWithApproval, {
        credentialHash: 'hash',
        organizationId,
        projectId,
        approvalId,
      }),
    ).rejects.toThrow('Approval required')

    await t.withIdentity({ subject: 'owner' }).mutation(api.approvals.approveProjectDelete, {
      projectId,
    })

    const approvedApproval = await t.run(async (ctx) => {
      return await ctx.db
        .query('approvals')
        .withIndex('by_operation_resource', (q) =>
          q.eq('operation', 'projects.delete').eq('resourceId', projectId),
        )
        .filter((q) => q.eq(q.field('status'), 'approved'))
        .unique()
    })
    expect(approvedApproval).toMatchObject({
      organizationId,
      operation: 'projects.delete',
      resourceId: projectId,
      status: 'approved',
    })
    expect(approvedApproval?.approvedBy).toBeTruthy()

    await t.mutation(api.projects.deleteWithApproval, {
      credentialHash: 'hash',
      organizationId,
      projectId,
      approvalId: approvedApproval!._id,
    })

    const deleted = await t.run(async (ctx) => await ctx.db.get(projectId))
    expect(deleted).toBeNull()
  })

  it('only an active organization admin can approve destructive project actions', async () => {
    const t = convexTest(schema, modules)
    const { organizationId } = await seedActor(t, 'admin')
    await seedHumanMember(t, organizationId, 'member', 'member')
    await seedHumanMember(t, organizationId, 'admin', 'admin')
    const projectId = await t.mutation(api.projects.createFromServiceActor, {
      credentialHash: 'hash',
      organizationId,
      name: 'Delete me',
    })

    await expect(
      t.withIdentity({ subject: 'member' }).mutation(api.approvals.approveProjectDelete, {
        projectId,
      }),
    ).rejects.toThrow('Insufficient organization role')

    const approvalId = await t.withIdentity({ subject: 'admin' }).mutation(api.approvals.approveProjectDelete, {
      projectId,
    })
    const approval = await t.run(async (ctx) => await ctx.db.get(approvalId))
    expect(approval).toMatchObject({
      organizationId,
      operation: 'projects.delete',
      resourceId: projectId,
      status: 'approved',
    })
    expect(approval?.approvedBy).toBeTruthy()
  })

  it('does not let another organization admin approve destructive project actions', async () => {
    const t = convexTest(schema, modules)
    const { organizationId } = await seedActor(t, 'admin')
    const projectId = await t.mutation(api.projects.createFromServiceActor, {
      credentialHash: 'hash',
      organizationId,
      name: 'Delete me',
    })
    const otherOrganizationId = await t.run(async (ctx) => {
      return await ctx.db.insert('organizations', {
        name: 'Other',
        createdAt: Date.now(),
      })
    })
    await seedHumanMember(t, otherOrganizationId, 'other-admin', 'admin')

    await expect(
      t.withIdentity({ subject: 'other-admin' }).mutation(api.approvals.approveProjectDelete, {
        projectId,
      }),
    ).rejects.toThrow('Insufficient organization role')

    const approvals = await t.run(async (ctx) => await ctx.db.query('approvals').collect())
    expect(approvals).toHaveLength(0)
  })

  it('rejects expired and reused destructive approvals', async () => {
    const t = convexTest(schema, modules)
    const { organizationId } = await seedActor(t, 'admin')
    const ownerId = await seedHumanMember(t, organizationId, 'owner', 'owner')
    const expiredProjectId = await t.mutation(api.projects.createFromServiceActor, {
      credentialHash: 'hash',
      organizationId,
      name: 'Expired',
    })
    const reusedProjectId = await t.mutation(api.projects.createFromServiceActor, {
      credentialHash: 'hash',
      organizationId,
      name: 'Reused',
    })
    const expiredApprovalId = await t.run(async (ctx) => {
      return await ctx.db.insert('approvals', {
        organizationId,
        operation: 'projects.delete',
        resourceId: expiredProjectId,
        status: 'approved',
        approvedBy: ownerId,
        expiresAt: Date.now() - 1,
        createdAt: Date.now(),
      })
    })
    const reusedApprovalId = await t.withIdentity({ subject: 'owner' }).mutation(api.approvals.approveProjectDelete, {
      projectId: reusedProjectId,
    })

    await expect(
      t.mutation(api.projects.deleteWithApproval, {
        credentialHash: 'hash',
        organizationId,
        projectId: expiredProjectId,
        approvalId: expiredApprovalId,
      }),
    ).rejects.toThrow('Approval required')

    await t.mutation(api.projects.deleteWithApproval, {
      credentialHash: 'hash',
      organizationId,
      projectId: reusedProjectId,
      approvalId: reusedApprovalId,
    })
    const nextProjectId = await t.mutation(api.projects.createFromServiceActor, {
      credentialHash: 'hash',
      organizationId,
      name: 'Next',
    })
    await expect(
      t.mutation(api.projects.deleteWithApproval, {
        credentialHash: 'hash',
        organizationId,
        projectId: nextProjectId,
        approvalId: reusedApprovalId,
      }),
    ).rejects.toThrow('Approval required')
  })
})
