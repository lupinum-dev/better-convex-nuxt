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
    expect(validated?.userId).toBe(team.users.owner.authId)

    await ctx.raw.mutation(api.mcpKeys.touch, { id: keyId, seenAt: 100_000 })
    await ctx.raw.mutation(api.mcpKeys.touch, { id: keyId, seenAt: 120_000 })

    const keysAfterFastTouch = await team.users.owner.query(api.mcpKeys.list, {})
    expect(keysAfterFastTouch[0]?.lastUsedAt).toBe(100_000)

    await ctx.raw.mutation(api.mcpKeys.touch, { id: keyId, seenAt: 170_001 })

    const keysAfterDebouncedTouch = await team.users.owner.query(api.mcpKeys.list, {})
    expect(keysAfterDebouncedTouch[0]?.lastUsedAt).toBe(170_001)
    expect('hash' in (keysAfterDebouncedTouch[0] ?? {})).toBe(false)
  })
})
