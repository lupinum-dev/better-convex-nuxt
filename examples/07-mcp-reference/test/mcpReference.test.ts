/// <reference types="vite/client" />

import { readFileSync } from 'node:fs'

import { createIdentityForwardingEnvelope } from '@lupinum/trellis/backend'
import { createTestContext } from '@lupinum/trellis/testing'
import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { mcpManage } from '../convex/features/mcpKeys/permissions'
import {
  runbookBulkDelete,
  runbookCreate,
  runbookRead,
} from '../convex/features/runbooks/permissions'
import schema from '../convex/schema'
import { modules } from '../convex/test.setup'

const api = anyApi as any
type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer'
const IDENTITY_FORWARDING_KEY = 'mcp-reference-test-identity-forwarding-key'
const functionNameSymbol = Symbol.for('functionName')

function createCtx() {
  return createTestContext<typeof schema, WorkspaceRole>({
    schema,
    modules,
    identityForwardingKey: IDENTITY_FORWARDING_KEY,
  })
}

function getFunctionRef(ref: unknown): string {
  if (typeof ref === 'string') return ref
  if (typeof ref === 'object' && ref !== null) {
    const record = ref as Record<string | symbol, unknown>
    if (typeof record[functionNameSymbol] === 'string') return record[functionNameSymbol]
    if (typeof record._path === 'string') return record._path
    if (typeof record.functionPath === 'string') return record.functionPath
  }

  throw new Error('Expected generated Convex function ref in MCP reference test.')
}

function withSignedForwarding(
  args: Record<string, unknown>,
  options: {
    caller: Record<string, unknown>
    actingFor?: Record<string, unknown>
    ref: unknown
    operation: 'query' | 'mutation' | 'action'
  },
) {
  const principalSubject = options.caller.subject
  if (typeof principalSubject !== 'string' || !principalSubject) {
    throw new Error('Signed test forwarding requires a canonical caller subject.')
  }

  return {
    ...args,
    _trellisForwarding: createIdentityForwardingEnvelope({
      key: IDENTITY_FORWARDING_KEY,
      keyId: 'default',
      iss: 'trellis://server',
      aud: 'trellis://convex',
      jti: `mcp-reference-${options.operation}-${principalSubject}`,
      sub: principalSubject,
      caller: options.caller,
      ...(options.actingFor ? { actingFor: options.actingFor } : {}),
      transport: 'server',
      purpose: options.operation,
      functionRef: getFunctionRef(options.ref),
      args,
      ttlMs: options.operation === 'query' ? 60_000 : 30_000,
    }),
  }
}

describe('mcp reference example', () => {
  it('keeps anonymous MCP tools read-only and gates session writes', () => {
    const readServerFile = (relativePath: string) =>
      readFileSync(new URL(`../server/${relativePath}`, import.meta.url), 'utf8')

    const publicReadTools = [
      'mcp/tools/runbooks/list-public.ts',
      'mcp/tools/runbooks/search-public.ts',
      'mcp/tools/session/get-session-focus.ts',
    ]
    const gatedWriteTools = [
      'mcp/tools/session/set-session-focus.ts',
      'mcp/tools/session/register-session-shortcut.ts',
      'mcp/tools/session/unregister-session-shortcut.ts',
    ]

    for (const relativePath of publicReadTools) {
      const source = readServerFile(relativePath)
      expect(source).not.toContain('session.set(')
      expect(source).not.toContain('tool.mutation(')
      expect(source).not.toContain('tool.operation(')
    }

    for (const relativePath of gatedWriteTools) {
      const source = readServerFile(relativePath)
      expect(source).toContain('enabled: (event) => !!event.context.mcpAuth')
      expect(source).toContain('Authentication required.')
    }

    const middleware = readServerFile('middleware/mcp-auth.ts')
    expect(middleware).toContain("event.path?.startsWith('/mcp')")
    expect(middleware).toContain("event.path.startsWith('/mcp/runbook-agent')")
  })

  it('lets a signed-in user without a workspace create their first workspace', async () => {
    const ctx = createCtx()
    const authKey = 'first_workspace_owner'

    await ctx.seed('users', {
      authKey,
      email: 'owner@example.com',
      displayName: 'First Owner',
      role: 'member',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    const workspaceId = await ctx.raw
      .withIdentity({
        subject: authKey,
        tokenIdentifier: authKey,
        email: 'owner@example.com',
        name: 'First Owner',
      })
      .mutation(api.features.workspaces.domain.createWorkspaceMutation, {
        name: 'First Workspace',
        slug: 'first-workspace',
      })

    expect(workspaceId).toBeTruthy()

    const accessContext = await ctx.raw
      .withIdentity({
        subject: authKey,
        tokenIdentifier: authKey,
        email: 'owner@example.com',
        name: 'First Owner',
      })
      .query(api.permissions.context.getAccessContext, {})

    expect(accessContext).toMatchObject({
      role: 'owner',
      userId: expect.any(String),
      workspaceId: workspaceId,
      can: {
        [runbookRead.key]: true,
        [runbookCreate.key]: true,
        [runbookBulkDelete.key]: true,
        [mcpManage.key]: true,
      },
    })
  })

  it('returns an onboarding-safe access context for authenticated users without a workspace', async () => {
    const ctx = createCtx()
    const authKey = 'user_without_workspace'
    const userId = await ctx.seed('users', {
      authKey,
      email: 'onboarding@example.com',
      displayName: 'Onboarding User',
      role: 'member',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    const accessContext = await ctx.raw
      .withIdentity({
        subject: authKey,
        tokenIdentifier: authKey,
        email: 'onboarding@example.com',
        name: 'Onboarding User',
      })
      .query(api.permissions.context.getAccessContext, {})

    expect(accessContext).toMatchObject({
      role: 'member',
      userId,
      workspaceId: null,
      email: 'onboarding@example.com',
      displayName: 'Onboarding User',
      can: {
        [runbookRead.key]: false,
        [runbookCreate.key]: false,
        [mcpManage.key]: false,
        [runbookBulkDelete.key]: false,
      },
    })
    expect(userId).toBeTruthy()
  })

  it('projects workspace recordAccess for delegated MCP principals', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Alpha',
      users: {
        member: { role: 'member' },
      },
    })

    const accessContext = await ctx.raw.query(
      api.permissions.context.getAccessContext,
      withSignedForwarding(
        {},
        {
          ref: api.permissions.context.getAccessContext,
          operation: 'query',
          caller: {
            kind: 'agent',
            agentId: 'primary-mcp-key',
            subject: 'agent:primary-mcp-key',
            provider: 'mcp',
          },
          actingFor: {
            subject: `user:${team.users.member.id}`,
          },
        },
      ),
    )

    expect(accessContext).toMatchObject({
      role: 'member',
      userId: team.users.member.id,
      can: {
        [runbookRead.key]: true,
        [runbookCreate.key]: true,
        [runbookBulkDelete.key]: false,
        [mcpManage.key]: false,
      },
    })
    expect(accessContext?.workspaceId).toEqual(expect.any(String))
  })

  it('keeps public runbooks visible without auth while workspace queries stay protected', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Alpha',
      users: {
        owner: { role: 'owner' },
      },
    })

    await team.users.owner.mutation(api.features.runbooks.domain.create, {
      title: 'Public handoff',
      summary: 'Shared with anyone.',
      content: '# Public handoff\n\n1. Share status',
      visibility: 'public',
      tags: ['public'],
    })

    const publicRunbooks = await ctx.raw.query(api.features.runbooks.domain.listPublic, {})
    expect(
      publicRunbooks.some((runbook: { title: string }) => runbook.title === 'Public handoff'),
    ).toBe(true)
    const publicRunbook = publicRunbooks.find(
      (runbook: { title: string }) => runbook.title === 'Public handoff',
    )
    expect(publicRunbook).toBeTruthy()
    expect('workspaceId' in (publicRunbook ?? {})).toBe(false)
    expect('ownerId' in (publicRunbook ?? {})).toBe(false)

    await expect(ctx.raw.query(api.features.runbooks.domain.listWorkspace, {})).rejects.toThrow(
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
        .asCaller({
          kind: 'user',
          authKey: team.users.viewer.authKey,
          subject: `auth:${team.users.viewer.authKey}`,
        })
        .mutation(api.features.runbooks.domain.create, {
          title: 'Viewer should fail',
          summary: 'No permission',
          content: '# Nope',
          visibility: 'draft',
          tags: [],
        }),
    ).rejects.toThrow(/Forbidden: Create runbook/)

    await expect(
      team.users.member.mutation(api.features.runbooks.domain.create, {
        title: 'Member may create',
        summary: 'Allowed',
        content: '# Allowed',
        visibility: 'draft',
        tags: ['ops'],
      }),
    ).resolves.toBeTruthy()
  })

  it('applies the same create permission rules to delegated service principals', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Alpha',
      users: {
        viewer: { role: 'viewer' },
        member: { role: 'member' },
      },
    })

    await expect(
      ctx.raw.mutation(
        api.features.runbooks.domain.create,
        withSignedForwarding(
          {
            title: 'Webhook viewer should fail',
            summary: 'No permission',
            content: '# Nope',
            visibility: 'workspace',
            tags: ['webhook'],
          },
          {
            ref: api.features.runbooks.domain.create,
            operation: 'mutation',
            caller: {
              kind: 'service',
              serviceId: 'runbook-webhook',
              subject: 'service:runbook-webhook',
            },
            actingFor: {
              subject: `user:${team.users.viewer.id}`,
              reason: 'verified runbook webhook',
            },
          },
        ),
      ),
    ).rejects.toThrow(/Forbidden: Create runbook/)

    await expect(
      ctx.raw.mutation(
        api.features.runbooks.domain.create,
        withSignedForwarding(
          {
            title: 'Webhook member may create',
            summary: 'Allowed',
            content: '# Allowed',
            visibility: 'workspace',
            tags: ['webhook'],
          },
          {
            ref: api.features.runbooks.domain.create,
            operation: 'mutation',
            caller: {
              kind: 'service',
              serviceId: 'runbook-webhook',
              subject: 'service:runbook-webhook',
            },
            actingFor: {
              subject: `user:${team.users.member.id}`,
              reason: 'verified runbook webhook',
            },
          },
        ),
      ),
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

    const keyId = await team.users.owner.mutation(api.features.mcpKeys.domain.create, {
      name: 'Primary key',
      boundUserId: team.users.member.id,
      prefix: 'mcp_deadbeef...',
      hash: 'hash_123',
    })

    const validated = await ctx.raw.query(api.features.mcpKeys.domain.validate, {
      hash: 'hash_123',
    })
    expect(validated?.id).toBe(keyId)
    expect(validated?.userId).toBe(team.users.member.id)
    expect(validated?.role).toBe('member')

    await ctx.raw.mutation(api.features.mcpKeys.domain.touch, { hash: 'hash_123' })
    await ctx.raw.mutation(api.features.mcpKeys.domain.touch, { hash: 'hash_123' })

    const keysAfterFastTouch = await team.users.owner.query(api.features.mcpKeys.domain.list, {})
    const firstLastUsedAt = keysAfterFastTouch[0]?.lastUsedAt
    expect(firstLastUsedAt).toEqual(expect.any(Number))

    await ctx.raw.run(async (innerCtx) => {
      await innerCtx.db.patch(keyId as never, {
        lastUsedAt: 0,
      })
    })
    await ctx.raw.mutation(api.features.mcpKeys.domain.touch, { hash: 'hash_123' })

    const keysAfterDebouncedTouch = await team.users.owner.query(
      api.features.mcpKeys.domain.list,
      {},
    )
    expect(keysAfterDebouncedTouch[0]?.lastUsedAt).toEqual(expect.any(Number))
    expect(keysAfterDebouncedTouch[0]?.lastUsedAt).not.toBe(0)
    expect('hash' in (keysAfterDebouncedTouch[0] ?? {})).toBe(false)
    expect(keysAfterDebouncedTouch[0]?.boundUser?.authKey).toBe(team.users.member.authKey)
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

    await team.users.owner.mutation(api.features.mcpKeys.domain.create, {
      name: 'Member key',
      boundUserId: team.users.member.id,
      prefix: 'mcp_member...',
      hash: 'hash_member',
    })

    expect(
      await ctx.raw.query(api.features.mcpKeys.domain.validate, { hash: 'hash_member' }),
    ).toMatchObject({
      role: 'member',
      userId: team.users.member.id,
    })

    await ctx.raw.run(async (innerCtx) => {
      await innerCtx.db.patch(team.users.member.id as never, {
        role: 'viewer',
        updatedAt: Date.now(),
      })
    })

    expect(
      await ctx.raw.query(api.features.mcpKeys.domain.validate, { hash: 'hash_member' }),
    ).toMatchObject({
      role: 'viewer',
      userId: team.users.member.id,
    })
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

    const keyId = await team.users.owner.mutation(api.features.mcpKeys.domain.create, {
      name: 'Member key',
      boundUserId: team.users.member.id,
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
      await ctx.raw.query(api.features.mcpKeys.domain.validate, { hash: 'hash_member_dead' }),
    ).toBeNull()

    const keys = await team.users.owner.query(api.features.mcpKeys.domain.list, {})
    expect(keys.find((key: { _id: string }) => key._id === keyId)?.usability).toBe(
      'bound_user_missing',
    )
  })
})
