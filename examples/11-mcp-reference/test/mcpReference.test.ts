/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { createTestContext } from '../../../dist/runtime/testing/index.js'

import schema from '../convex/schema'
import { modules } from '../convex/test.setup'

const api = anyApi

function createCtx() {
  return createTestContext({
    schema,
    modules,
    tenant: {
      table: 'workspaces',
      field: 'workspaceId',
    },
  })
}

describe('mcp reference example', () => {
  it('returns an onboarding-safe permission context for authenticated users without a workspace', async () => {
    const ctx = createCtx()
    const authId = 'user_without_workspace'
    const userId = await ctx.seed('users', {
      authId,
      email: 'onboarding@example.com',
      displayName: 'Onboarding User',
      role: 'member',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    const permissionContext = await ctx.raw.withIdentity({
      subject: authId,
      email: 'onboarding@example.com',
      name: 'Onboarding User',
    }).query(api.workspaces.getPermissionContext, {})

    expect(permissionContext).toMatchObject({
      role: 'member',
      userId: authId,
      tenantId: null,
      email: 'onboarding@example.com',
      displayName: 'Onboarding User',
      can: {
        'runbook.read': false,
        'runbook.create': false,
        'mcp.manage': false,
      },
    })
    expect(userId).toBeTruthy()
  })

  it('keeps public runbooks visible without auth while workspace queries stay protected', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Alpha',
      users: {
        owner: { role: 'owner' },
      },
    })

    await team.users.owner.mutation(api.runbooks.create, {
      title: 'Public handoff',
      summary: 'Shared with anyone.',
      content: '# Public handoff\n\n1. Share status',
      visibility: 'public',
      tags: ['public'],
    })

    const publicRunbooks = await ctx.raw.query(api.runbooks.listPublic, {})
    expect(publicRunbooks.some((runbook: { title: string }) => runbook.title === 'Public handoff')).toBe(true)
    const publicRunbook = publicRunbooks.find((runbook: { title: string }) => runbook.title === 'Public handoff')
    expect(publicRunbook).toBeTruthy()
    expect('workspaceId' in (publicRunbook ?? {})).toBe(false)
    expect('ownerId' in (publicRunbook ?? {})).toBe(false)

    await expect(ctx.raw.query(api.runbooks.listWorkspace, {})).rejects.toThrow('Forbidden: Read runbooks')
  })

  it('applies the same create permission rules to service-auth callers', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Alpha',
      users: {
        viewer: { role: 'viewer' },
        member: { role: 'member' },
      },
    })

    await expect(
      ctx.asService({
        userId: team.users.viewer.authId,
        role: 'viewer',
        tenantId: team.id,
      }).mutation(api.runbooks.create, {
        title: 'Viewer should fail',
        summary: 'No permission',
        content: '# Nope',
        visibility: 'draft',
        tags: [],
      }),
    ).rejects.toThrow('Forbidden: Create runbook')

    await expect(
      ctx.asService({
        userId: team.users.member.authId,
        role: 'member',
        tenantId: team.id,
      }).mutation(api.runbooks.create, {
        title: 'Member may create',
        summary: 'Allowed',
        content: '# Allowed',
        visibility: 'draft',
        tags: ['ops'],
      }),
    ).resolves.toBeTruthy()
  })

  it('stores only hashes for MCP keys and debounces last-used writes', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Alpha',
      users: {
        owner: { role: 'owner' },
      },
    })

    const keyId = await team.users.owner.mutation(api.mcpKeys.create, {
      name: 'Primary key',
      role: 'member',
      prefix: 'mcp_deadbeef...',
      hash: 'hash_123',
    })

    const validated = await ctx.raw.query(api.mcpKeys.validate, { hash: 'hash_123' })
    expect(validated?.id).toBe(keyId)
    expect(validated?.userId).toBe(`mcp-key:${keyId}`)

    await ctx.raw.mutation(api.mcpKeys.touch, { id: keyId, seenAt: 100_000 })
    await ctx.raw.mutation(api.mcpKeys.touch, { id: keyId, seenAt: 120_000 })

    const keysAfterFastTouch = await team.users.owner.query(api.mcpKeys.list, {})
    expect(keysAfterFastTouch[0]?.lastUsedAt).toBe(100_000)

    await ctx.raw.mutation(api.mcpKeys.touch, { id: keyId, seenAt: 170_001 })

    const keysAfterDebouncedTouch = await team.users.owner.query(api.mcpKeys.list, {})
    expect(keysAfterDebouncedTouch[0]?.lastUsedAt).toBe(170_001)
    expect('hash' in (keysAfterDebouncedTouch[0] ?? {})).toBe(false)
  })

  it('keeps owner keys on the issuing owner identity while lower-privilege keys get isolated service principals', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Alpha',
      users: {
        owner: { role: 'owner' },
      },
    })

    const ownerKeyId = await team.users.owner.mutation(api.mcpKeys.create, {
      name: 'Owner key',
      role: 'owner',
      prefix: 'mcp_owner...',
      hash: 'hash_owner',
    })

    const memberKeyId = await team.users.owner.mutation(api.mcpKeys.create, {
      name: 'Member key',
      role: 'member',
      prefix: 'mcp_member...',
      hash: 'hash_member',
    })

    const ownerValidated = await ctx.raw.query(api.mcpKeys.validate, { hash: 'hash_owner' })
    const memberValidated = await ctx.raw.query(api.mcpKeys.validate, { hash: 'hash_member' })

    expect(ownerValidated).toMatchObject({
      id: ownerKeyId,
      role: 'owner',
      userId: team.users.owner.authId,
    })
    expect(memberValidated).toMatchObject({
      id: memberKeyId,
      role: 'member',
      userId: `mcp-key:${memberKeyId}`,
    })
  })
})
