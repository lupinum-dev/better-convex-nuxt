/// <reference types="vite/client" />

import { createTestContext } from '@lupinum/trellis/testing'
import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import {
  mcpManage,
  runbookBulkDelete,
  runbookCreate,
  runbookDelete,
  runbookRead,
} from '../convex/auth/permissions'
import schema from '../convex/schema'
import { modules } from '../convex/test.setup'

const api = anyApi as any
type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer'
const TRUSTED_CALLER_KEY = 'mcp-reference-test-trusted-caller-key'

function createCtx() {
  return createTestContext<typeof schema, WorkspaceRole>({
    schema,
    modules,
    trustedCallerKey: TRUSTED_CALLER_KEY,
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

    const permissionContext = await ctx.raw
      .withIdentity({
        subject: authId,
        email: 'onboarding@example.com',
        name: 'Onboarding User',
      })
      .query(api.permissions.context.getPermissionContext, {})

    expect(permissionContext).toMatchObject({
      role: 'member',
      userId: authId,
      tenantId: null,
      email: 'onboarding@example.com',
      displayName: 'Onboarding User',
      can: {
        [runbookRead.key]: false,
        [runbookCreate.key]: false,
        [mcpManage.key]: false,
        [runbookDelete.key]: false,
        [runbookBulkDelete.key]: false,
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

    await team.users.owner.mutation(api.domain.runbooks.create, {
      title: 'Public handoff',
      summary: 'Shared with anyone.',
      content: '# Public handoff\n\n1. Share status',
      visibility: 'public',
      tags: ['public'],
    })

    const publicRunbooks = await ctx.raw.query(api.domain.runbooks.listPublic, {})
    expect(
      publicRunbooks.some((runbook: { title: string }) => runbook.title === 'Public handoff'),
    ).toBe(true)
    const publicRunbook = publicRunbooks.find(
      (runbook: { title: string }) => runbook.title === 'Public handoff',
    )
    expect(publicRunbook).toBeTruthy()
    expect('workspaceId' in (publicRunbook ?? {})).toBe(false)
    expect('ownerId' in (publicRunbook ?? {})).toBe(false)

    await expect(ctx.raw.query(api.domain.runbooks.listWorkspace, {})).rejects.toThrow(
      'Forbidden: Read runbooks',
    )
  })

  it('applies the same create permission rules to forwarded principals', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Alpha',
      users: {
        viewer: { role: 'viewer' },
        member: { role: 'member' },
      },
    })

    await expect(
      ctx
        .asPrincipal({
          kind: 'user',
          userId: team.users.viewer.authId,
        })
        .mutation(api.domain.runbooks.create, {
          title: 'Viewer should fail',
          summary: 'No permission',
          content: '# Nope',
          visibility: 'draft',
          tags: [],
        }),
    ).rejects.toThrow(/Forbidden: Create runbook/)

    await expect(
      team.users.member.mutation(api.domain.runbooks.create, {
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
        member: { role: 'member' },
      },
    })

    const keyId = await team.users.owner.mutation(api.domain.mcpKeys.create, {
      name: 'Primary key',
      boundAuthId: team.users.member.authId,
      prefix: 'mcp_deadbeef...',
      hash: 'hash_123',
    })

    const validated = await ctx.raw.query(api.domain.mcpKeys.validate, { hash: 'hash_123' })
    expect(validated?.id).toBe(keyId)
    expect(validated?.userId).toBe(team.users.member.authId)
    expect(validated?.role).toBe('member')

    await ctx.raw.mutation(api.domain.mcpKeys.touch, { id: keyId, seenAt: 100_000 })
    await ctx.raw.mutation(api.domain.mcpKeys.touch, { id: keyId, seenAt: 120_000 })

    const keysAfterFastTouch = await team.users.owner.query(api.domain.mcpKeys.list, {})
    expect(keysAfterFastTouch[0]?.lastUsedAt).toBe(100_000)

    await ctx.raw.mutation(api.domain.mcpKeys.touch, { id: keyId, seenAt: 170_001 })

    const keysAfterDebouncedTouch = await team.users.owner.query(api.domain.mcpKeys.list, {})
    expect(keysAfterDebouncedTouch[0]?.lastUsedAt).toBe(170_001)
    expect('hash' in (keysAfterDebouncedTouch[0] ?? {})).toBe(false)
    expect(keysAfterDebouncedTouch[0]?.boundUser?.authId).toBe(team.users.member.authId)
    expect(keysAfterDebouncedTouch[0]?.effectiveRole).toBe('member')
    expect(keysAfterDebouncedTouch[0]?.usability).toBe('usable')
  })

  it('resolves bound users with live role changes', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Alpha',
      users: {
        owner: { role: 'owner' },
        member: { role: 'member' },
      },
    })

    await team.users.owner.mutation(api.domain.mcpKeys.create, {
      name: 'Member key',
      boundAuthId: team.users.member.authId,
      prefix: 'mcp_member...',
      hash: 'hash_member',
    })

    expect(await ctx.raw.query(api.domain.mcpKeys.validate, { hash: 'hash_member' })).toMatchObject(
      {
        role: 'member',
        userId: team.users.member.authId,
      },
    )

    await ctx.raw.run(async (innerCtx) => {
      await innerCtx.db.patch(team.users.member.id as never, {
        role: 'viewer',
        updatedAt: Date.now(),
      })
    })

    expect(await ctx.raw.query(api.domain.mcpKeys.validate, { hash: 'hash_member' })).toMatchObject(
      {
        role: 'viewer',
        userId: team.users.member.authId,
      },
    )
  })

  it('marks dead bindings in listings and invalidates affected keys', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Alpha',
      users: {
        owner: { role: 'owner' },
        member: { role: 'member' },
      },
    })

    const keyId = await team.users.owner.mutation(api.domain.mcpKeys.create, {
      name: 'Member key',
      boundAuthId: team.users.member.authId,
      prefix: 'mcp_member...',
      hash: 'hash_member_dead',
    })

    await ctx.raw.run(async (innerCtx) => {
      await innerCtx.db.patch(team.users.member.id as never, {
        workspaceId: undefined,
        updatedAt: Date.now(),
      })
    })

    expect(
      await ctx.raw.query(api.domain.mcpKeys.validate, { hash: 'hash_member_dead' }),
    ).toBeNull()

    const keys = await team.users.owner.query(api.domain.mcpKeys.list, {})
    expect(keys.find((key: { _id: string }) => key._id === keyId)?.usability).toBe(
      'bound_user_missing',
    )
  })
})
