import { v } from 'convex/values'
import { afterEach, describe, expect, it } from 'vitest'

import { open } from '../../src/runtime/auth'
import { defineTrellis, trellisBackendLaneMetadataKey } from '../../src/runtime/backend'
import {
  defineOperation,
  transportExecuteOperationRef,
} from '../../src/runtime/functions/define-operation'
import {
  hashConfirmationValue,
  signConfirmationToken,
} from '../../src/runtime/mcp/confirmation-token'
import { createObservationCapture } from '../../src/runtime/testing'
import { createTrustedForwardingEnvelopeArgs } from '../../src/runtime/trusted-forwarding/shared'

type MemoryRow = Record<string, unknown>

function createMemoryDb() {
  const tables: Record<string, MemoryRow[]> = {}

  return {
    tables,
    db: {
      query: (table: string) => ({
        withIndex: (
          _indexName: string,
          callback: (q: { eq: (field: string, value: unknown) => unknown }) => unknown,
        ) => {
          const filters: Array<{ field: string; value: unknown }> = []
          callback({
            eq: (field, value) => {
              filters.push({ field, value })
              return null
            },
          })
          return {
            unique: async () =>
              (tables[table] ?? []).find((row) =>
                filters.every((filter) => row[filter.field] === filter.value),
              ) ?? null,
          }
        },
      }),
      insert: async (table: string, value: MemoryRow) => {
        tables[table] ??= []
        tables[table].push(value)
        return `${table}:${tables[table].length}`
      },
    },
  }
}

async function confirmationToken(args: {
  operationId: string
  executeArgs: Record<string, unknown>
  confirm: Record<string, unknown>
  version?: unknown
  jti: string
}) {
  return await signConfirmationToken({
    v: 1,
    operationId: args.operationId,
    executePath: 'execute',
    previewPath: 'preview',
    jti: args.jti,
    principalKey: 'principal:test',
    tenantKey: 'tenant:test',
    argsHash: await hashConfirmationValue(args.executeArgs),
    previewHash: await hashConfirmationValue(args.confirm),
    ...(args.version === undefined
      ? {}
      : { versionHash: await hashConfirmationValue(args.version) }),
  })
}

describe('defineTrellis', () => {
  const originalTrustedForwardingKey = process.env.CONVEX_TRUSTED_FORWARDING_KEY

  afterEach(() => {
    if (originalTrustedForwardingKey === undefined) {
      delete process.env.CONVEX_TRUSTED_FORWARDING_KEY
    } else {
      process.env.CONVEX_TRUSTED_FORWARDING_KEY = originalTrustedForwardingKey
    }
  })

  it('exposes explicit backend lanes and unsafe escape hatches', () => {
    const builder = () => null as never

    const runtime = defineTrellis({
      query: builder,
      mutation: builder,
    })

    expect(runtime.query).toBeTypeOf('function')
    expect(runtime.mutation).toBeTypeOf('function')
    expect(runtime.query.public).toBeTypeOf('function')
    expect(runtime.query.protected).toBeTypeOf('function')
    expect(runtime.query.unsafe).toBeTypeOf('function')
    expect(runtime.mutation.public).toBeTypeOf('function')
    expect(runtime.mutation.protected).toBeTypeOf('function')
    expect(runtime.mutation.unsafe).toBeTypeOf('function')
    expect(runtime.unsafe.query).toBeTypeOf('function')
    expect(runtime.unsafe.mutation).toBeTypeOf('function')
    expect(runtime).not.toHaveProperty('app')
    expect(runtime).not.toHaveProperty('publicQuery')
  })

  it('rejects unclassified backend handler definitions', () => {
    const builder = ((definition: unknown) => definition) as never

    const runtime = defineTrellis({
      query: builder,
      mutation: builder,
    })

    expect(() =>
      runtime.query({
        args: {},
        guard: open,
        handler: async () => ({ ok: true }),
      } as never),
    ).toThrow(/Unclassified backend handlers are not allowed/)
    expect(() =>
      runtime.mutation({
        args: {},
        guard: open,
        handler: async () => ({ ok: true }),
      } as never),
    ).toThrow(/Unclassified backend handlers are not allowed/)
  })

  it('stamps explicit backend lane metadata', () => {
    const builder = ((definition: unknown) => definition) as never

    const runtime = defineTrellis({
      query: builder,
      mutation: builder,
    })

    const publicQuery = runtime.query.public({
      args: {},
      handler: async () => ({ ok: true }),
    } as never) as Record<PropertyKey, unknown>
    const protectedMutation = runtime.mutation.protected({
      args: {},
      guard: open,
      handler: async () => ({ ok: true }),
    } as never) as Record<PropertyKey, unknown>
    const unsafeMutation = runtime.mutation.unsafe({
      args: {},
      bypass: 'test setup',
      handler: async () => ({ ok: true }),
    } as never) as Record<PropertyKey, unknown>

    expect(publicQuery[trellisBackendLaneMetadataKey]).toBe('public')
    expect(protectedMutation[trellisBackendLaneMetadataKey]).toBe('protected')
    expect(unsafeMutation[trellisBackendLaneMetadataKey]).toBe('unsafe')
  })

  it('rejects guard on public backend lane', () => {
    const builder = ((definition: unknown) => definition) as never

    const runtime = defineTrellis({
      query: builder,
      mutation: builder,
    })

    expect(() =>
      runtime.query.public({
        args: {},
        guard: open,
        handler: async () => ({ ok: true }),
      } as never),
    ).toThrow(/must not provide `guard`/)
  })

  it('rejects protected backend handlers without a guard', () => {
    const builder = ((definition: unknown) => definition) as never

    const runtime = defineTrellis({
      query: builder,
      mutation: builder,
    })

    expect(() =>
      runtime.query.protected({
        args: {},
        handler: async () => ({ ok: true }),
      } as never),
    ).toThrow(/protected backend handlers require `guard`/)
  })

  it('rejects signed forwarding envelopes for the wrong function ref on real protected handlers', async () => {
    process.env.CONVEX_TRUSTED_FORWARDING_KEY = 'trusted-key-with-enough-alpha-entropy'
    const builder = ((definition: unknown) => definition) as never
    const runtime = defineTrellis({
      query: builder,
      mutation: builder,
    })

    const definition = runtime.query.public({
      args: {
        title: v.string(),
      },
      trustedForwardingFunctionRef: 'posts:create',
      handler: async () => ({ ok: true }),
    } as never) as {
      handler: (
        ctx: {
          auth: { getUserIdentity: () => Promise<null> }
          db: Record<string, never>
          observe: (event: Record<string, unknown>) => Promise<void>
        },
        args: Record<string, unknown>,
      ) => Promise<unknown>
    }

    const args = createTrustedForwardingEnvelopeArgs({
      args: { title: 'Hello' },
      principal: { kind: 'agent', agentId: 'a1', subject: 'agent:a1' },
      functionRef: 'posts:delete',
      operation: 'query',
      jti: 'wrong-function-ref',
      now: Date.UTC(2026, 4, 9, 12, 0, 0),
    })

    await expect(
      definition.handler(
        {
          auth: { getUserIdentity: async () => null },
          db: {},
          observe: async () => {},
        },
        args,
      ),
    ).rejects.toThrow(/function-ref/)
  })

  it('rejects signed forwarding envelopes when handler metadata does not name the expected function ref', async () => {
    process.env.CONVEX_TRUSTED_FORWARDING_KEY = 'trusted-key-with-enough-alpha-entropy'
    const builder = ((definition: unknown) => definition) as never
    const runtime = defineTrellis({
      query: builder,
      mutation: builder,
    })

    const definition = runtime.query.public({
      args: {
        title: v.string(),
      },
      handler: async () => ({ ok: true }),
    } as never) as {
      handler: (
        ctx: {
          auth: { getUserIdentity: () => Promise<null> }
          db: Record<string, never>
          observe: (event: Record<string, unknown>) => Promise<void>
        },
        args: Record<string, unknown>,
      ) => Promise<unknown>
    }

    const args = createTrustedForwardingEnvelopeArgs({
      args: { title: 'Hello' },
      principal: { kind: 'agent', agentId: 'a1', subject: 'agent:a1' },
      functionRef: 'posts:create',
      operation: 'query',
      jti: 'missing-function-ref-metadata',
      now: Date.UTC(2026, 4, 9, 12, 0, 0),
    })

    await expect(
      definition.handler(
        {
          auth: { getUserIdentity: async () => null },
          db: {},
          observe: async () => {},
        },
        args,
      ),
    ).rejects.toThrow(/trustedForwardingFunctionRef metadata/)
  })

  it('uses projected operation function-ref metadata for trusted forwarding verification', async () => {
    process.env.CONVEX_TRUSTED_FORWARDING_KEY = 'trusted-key-with-enough-alpha-entropy'
    const builder = ((definition: unknown) => definition) as never
    const runtime = defineTrellis(
      {
        query: builder,
        mutation: builder,
      },
      {
        destructiveSafety: {
          redemptionTable: 'destructiveRedemptions' as never,
          auditTable: 'destructiveAuditLog' as never,
        },
      },
    )

    const operation = defineOperation({
      id: 'tasks.delete',
      kind: 'destructive',
      args: {
        id: v.string(),
      },
      guard: open,
      preview: async (_ctx, args) => ({
        display: { summary: `Delete ${args.id}` },
        confirm: { id: args.id },
      }),
      handler: async () => ({ deleted: true }),
    })
    const definition = runtime.mutation(
      transportExecuteOperationRef(operation, operation, {
        functionRef: 'tasks:delete',
      }),
    ) as {
      handler: (
        ctx: {
          auth: { getUserIdentity: () => Promise<null> }
          db: ReturnType<typeof createMemoryDb>['db']
          observe: (event: Record<string, unknown>) => Promise<void>
        },
        args: Record<string, unknown>,
      ) => Promise<unknown>
    }
    const args = createTrustedForwardingEnvelopeArgs({
      args: { id: 'task_1' },
      principal: { kind: 'agent', agentId: 'a1', subject: 'agent:a1' },
      functionRef: 'tasks:wrong',
      operation: 'mutation',
      purpose: 'operation-execute',
      jti: 'execute-1',
    })

    await expect(
      definition.handler(
        {
          auth: { getUserIdentity: async () => null },
          db: createMemoryDb().db,
          observe: async () => {},
        },
        args,
      ),
    ).rejects.toThrow(/function-ref/)
  })

  it('rejects replayed operation-execute forwarding envelopes before handler execution', async () => {
    process.env.CONVEX_TRUSTED_FORWARDING_KEY = 'trusted-key-with-enough-alpha-entropy'
    const builder = ((definition: unknown) => definition) as never
    const runtime = defineTrellis(
      {
        query: builder,
        mutation: builder,
      },
      {
        destructiveSafety: {
          redemptionTable: 'destructiveRedemptions' as never,
          auditTable: 'destructiveAuditLog' as never,
        },
      },
    )

    let executed = false
    const definition = runtime.mutation.public({
      args: {
        id: v.string(),
      },
      trustedForwardingFunctionRef: 'tasks:delete',
      handler: async () => {
        executed = true
        return { ok: true }
      },
    } as never) as {
      handler: (
        ctx: {
          auth: { getUserIdentity: () => Promise<null> }
          db: ReturnType<typeof createMemoryDb>['db']
          observe: (event: Record<string, unknown>) => Promise<void>
        },
        args: Record<string, unknown>,
      ) => Promise<unknown>
    }

    const memory = createMemoryDb()
    memory.tables.destructiveRedemptions = [{ jti: 'execute-1' }]
    const args = createTrustedForwardingEnvelopeArgs({
      args: { id: 'task_1' },
      principal: { kind: 'agent', agentId: 'a1', subject: 'agent:a1' },
      functionRef: 'tasks:delete',
      operation: 'mutation',
      purpose: 'operation-execute',
      jti: 'execute-1',
    })

    await expect(
      definition.handler(
        {
          auth: { getUserIdentity: async () => null },
          db: memory.db,
          observe: async () => {},
        },
        args,
      ),
    ).rejects.toThrow(/already been redeemed/i)
    expect(executed).toBe(false)
  })

  it('fails closed for operation-execute forwarding envelopes without destructive safety', async () => {
    process.env.CONVEX_TRUSTED_FORWARDING_KEY = 'trusted-key-with-enough-alpha-entropy'
    const builder = ((definition: unknown) => definition) as never
    const runtime = defineTrellis({
      query: builder,
      mutation: builder,
    })

    let executed = false
    const definition = runtime.mutation.public({
      args: {
        id: v.string(),
      },
      trustedForwardingFunctionRef: 'tasks:delete',
      handler: async () => {
        executed = true
        return { ok: true }
      },
    } as never) as {
      handler: (
        ctx: {
          auth: { getUserIdentity: () => Promise<null> }
          db: ReturnType<typeof createMemoryDb>['db']
          observe: (event: Record<string, unknown>) => Promise<void>
        },
        args: Record<string, unknown>,
      ) => Promise<unknown>
    }

    const args = createTrustedForwardingEnvelopeArgs({
      args: { id: 'task_1' },
      principal: { kind: 'agent', agentId: 'a1', subject: 'agent:a1' },
      functionRef: 'tasks:delete',
      operation: 'mutation',
      purpose: 'operation-execute',
      jti: 'execute-1',
    })

    await expect(
      definition.handler(
        {
          auth: { getUserIdentity: async () => null },
          db: createMemoryDb().db,
          observe: async () => {},
        },
        args,
      ),
    ).rejects.toThrow(/operation-execute envelopes require destructive safety redemption/i)
    expect(executed).toBe(false)
  })

  it('reports destructive safety misconfiguration for operation-execute envelope replay checks', async () => {
    process.env.CONVEX_TRUSTED_FORWARDING_KEY = 'trusted-key-with-enough-alpha-entropy'
    const builder = ((definition: unknown) => definition) as never
    const runtime = defineTrellis(
      {
        query: builder,
        mutation: builder,
      },
      {
        destructiveSafety: {
          redemptionTable: 'destructiveRedemptions' as never,
          auditTable: 'destructiveAuditLog' as never,
        },
      },
    )

    let executed = false
    const definition = runtime.mutation.public({
      args: {
        id: v.string(),
      },
      trustedForwardingFunctionRef: 'tasks:delete',
      handler: async () => {
        executed = true
        return { ok: true }
      },
    } as never) as {
      handler: (
        ctx: {
          auth: { getUserIdentity: () => Promise<null> }
          db: Record<string, never>
          observe: (event: Record<string, unknown>) => Promise<void>
        },
        args: Record<string, unknown>,
      ) => Promise<unknown>
    }

    const args = createTrustedForwardingEnvelopeArgs({
      args: { id: 'task_1' },
      principal: { kind: 'agent', agentId: 'a1', subject: 'agent:a1' },
      functionRef: 'tasks:delete',
      operation: 'mutation',
      purpose: 'operation-execute',
      jti: 'execute-1',
    })

    await expect(
      definition.handler(
        {
          auth: { getUserIdentity: async () => null },
          db: {},
          observe: async () => {},
        },
        args,
      ),
    ).rejects.toThrow(
      /Destructive safety for operation "tasks:delete" is misconfigured.*destructiveRedemptions.*by_jti.*destructiveAuditLog/i,
    )
    expect(executed).toBe(false)
  })

  it('forwards internal builders when provided', () => {
    const builder = () => null as never

    const runtime = defineTrellis({
      query: builder,
      mutation: builder,
      internalQuery: builder,
      internalMutation: builder,
    })

    expect(runtime.internalQuery).toBeTypeOf('function')
    expect(runtime.internalMutation).toBeTypeOf('function')
  })

  it('forwards action builders when provided', () => {
    const builder = () => null as never

    const runtime = defineTrellis({
      query: builder,
      mutation: builder,
      action: builder,
    })

    expect(runtime.action).toBeTypeOf('function')
    expect(runtime.unsafe.action).toBeTypeOf('function')
  })

  it('requires a bypass reason for unsafe builders', () => {
    const builder = ((definition: unknown) => definition) as never

    const runtime = defineTrellis({
      query: builder,
      mutation: builder,
    })

    expect(() =>
      runtime.unsafe.query({
        args: {},
        handler: async () => null,
      } as never),
    ).toThrow(/unsafe\.query\(\{ bypass \}\) requires a non-empty reason string/i)
  })

  it('emits an unsafe handler event with the bypass reason', async () => {
    const builder = ((definition: unknown) => definition) as never
    const capture = createObservationCapture()

    const runtime = defineTrellis({
      query: builder,
      mutation: builder,
    })

    const definition = runtime.unsafe.query({
      bypass: 'Public catalog listing is intentionally unauthenticated.',
      args: {},
      handler: async () => ['ok'],
    } as never) as {
      handler: (
        ctx: {
          auth: { getUserIdentity: () => Promise<null> }
          db: Record<string, never>
          observe: (event: Record<string, unknown>) => Promise<void>
        },
        args: Record<string, never>,
      ) => Promise<unknown>
    }

    await definition.handler(
      {
        auth: {
          getUserIdentity: async () => null,
        },
        db: {},
        observe: async () => {},
      },
      {},
    )

    expect(capture.find('unsafe.handler.used')).toContainEqual(
      expect.objectContaining({
        name: 'unsafe.handler.used',
        status: 'success',
        details: {
          reason: 'Public catalog listing is intentionally unauthenticated.',
          surface: 'unsafe.query',
        },
      }),
    )
    capture.stop()
  })

  it('rejects destructive operation registration when destructiveSafety is missing', () => {
    const builder = ((definition: unknown) => definition) as never

    const runtime = defineTrellis({
      query: builder,
      mutation: builder,
    })

    const destructiveOp = defineOperation({
      id: 'tests.destroy',
      kind: 'destructive',
      args: {
        id: v.string(),
      },
      guard: open,
      preview: async () => ({
        display: { summary: 'Destroy test record' },
        confirm: { operation: 'tests.destroy' },
      }),
      handler: async () => null,
    })

    expect(() => runtime.mutation(destructiveOp)).toThrow(/destructiveSafety/)
  })

  it('requires confirmation before executing destructive operation mutations', async () => {
    const builder = ((definition: unknown) => definition) as never
    const runtime = defineTrellis(
      {
        query: builder,
        mutation: builder,
      },
      {
        destructiveSafety: {
          redemptionTable: 'destructiveRedemptions' as never,
          auditTable: 'destructiveAuditLog' as never,
        },
      },
    )

    const destructiveOp = defineOperation({
      id: 'tests.destroy',
      kind: 'destructive',
      args: {
        id: v.string(),
      },
      guard: open,
      preview: async () => ({
        display: { summary: 'Destroy test record' },
        confirm: { operation: 'tests.destroy' },
      }),
      handler: async () => 'destroyed',
    })

    const definition = runtime.mutation(destructiveOp) as {
      handler: (
        ctx: {
          auth: { getUserIdentity: () => Promise<null> }
          db: Record<string, never>
          observe: (event: Record<string, unknown>) => Promise<void>
        },
        args: { id: string },
      ) => Promise<unknown>
    }
    const capture = createObservationCapture()

    await expect(
      definition.handler(
        {
          auth: { getUserIdentity: async () => null },
          db: {},
          observe: async () => {},
        },
        { id: 'record-1' },
      ),
    ).rejects.toThrow(/requires confirmation/i)

    expect(capture.find('operation.confirm.missing')).toContainEqual(
      expect.objectContaining({
        name: 'operation.confirm.missing',
        status: 'deny',
        operation: 'tests.destroy',
      }),
    )
    capture.stop()
  })

  it('rejects replayed destructive operation confirmation tokens', async () => {
    process.env.TRELLIS_MCP_CONFIRMATION_KEY = 'test-mcp-confirmation-key'
    const builder = ((definition: unknown) => definition) as never
    const runtime = defineTrellis(
      {
        query: builder,
        mutation: builder,
      },
      {
        destructiveSafety: {
          redemptionTable: 'destructiveRedemptions' as never,
          auditTable: 'destructiveAuditLog' as never,
        },
      },
    )

    let executions = 0
    const destructiveOp = defineOperation({
      id: 'tests.destroy',
      kind: 'destructive',
      args: {
        id: v.string(),
      },
      guard: open,
      preview: async (_ctx, args) => ({
        display: { summary: `Destroy ${args.id}` },
        confirm: { operation: 'tests.destroy', id: args.id },
      }),
      handler: async () => {
        executions += 1
        return 'destroyed'
      },
    })

    const definition = runtime.mutation(destructiveOp) as {
      handler: (
        ctx: {
          auth: { getUserIdentity: () => Promise<null> }
          db: ReturnType<typeof createMemoryDb>['db']
          observe: (event: Record<string, unknown>) => Promise<void>
        },
        args: { id: string; _confirmationToken: string },
      ) => Promise<unknown>
    }
    const memory = createMemoryDb()
    const executeArgs = { id: 'record-1' }
    const token = await confirmationToken({
      operationId: 'tests.destroy',
      executeArgs,
      confirm: { operation: 'tests.destroy', id: 'record-1' },
      jti: 'jti-replay-test',
    })
    const ctx = {
      auth: { getUserIdentity: async () => null },
      db: memory.db,
      observe: async () => {},
    }

    await expect(
      definition.handler(ctx, { ...executeArgs, _confirmationToken: token }),
    ).resolves.toBe('destroyed')
    await expect(
      definition.handler(ctx, { ...executeArgs, _confirmationToken: token }),
    ).rejects.toThrow(/already been redeemed/i)

    expect(executions).toBe(1)
    expect(memory.tables.destructiveRedemptions).toHaveLength(1)
    expect(memory.tables.destructiveAuditLog).toHaveLength(1)
  })

  it('requires operation-execute forwarding and confirmation tokens to share the same jti', async () => {
    process.env.CONVEX_TRUSTED_FORWARDING_KEY = 'trusted-key-with-enough-alpha-entropy'
    process.env.TRELLIS_MCP_CONFIRMATION_KEY = 'test-mcp-confirmation-key'
    const builder = ((definition: unknown) => definition) as never
    const runtime = defineTrellis(
      {
        query: builder,
        mutation: builder,
      },
      {
        destructiveSafety: {
          redemptionTable: 'destructiveRedemptions' as never,
          auditTable: 'destructiveAuditLog' as never,
        },
      },
    )

    let executed = false
    const destructiveOp = defineOperation({
      id: 'tests.destroy',
      kind: 'destructive',
      args: {
        id: v.string(),
      },
      trustedForwardingFunctionRef: 'tasks:delete',
      guard: open,
      preview: async (_ctx, args) => ({
        display: { summary: `Destroy ${args.id}` },
        confirm: { id: args.id },
      }),
      handler: async () => {
        executed = true
        return 'destroyed'
      },
    })

    const definition = runtime.mutation(destructiveOp) as {
      handler: (
        ctx: {
          auth: { getUserIdentity: () => Promise<null> }
          db: ReturnType<typeof createMemoryDb>['db']
          observe: (event: Record<string, unknown>) => Promise<void>
        },
        args: Record<string, unknown>,
      ) => Promise<unknown>
    }
    const memory = createMemoryDb()
    const executeArgs = { id: 'record-1' }
    const token = await confirmationToken({
      operationId: 'tests.destroy',
      executeArgs,
      confirm: { id: 'record-1' },
      jti: 'confirmation-jti',
    })
    const args = createTrustedForwardingEnvelopeArgs({
      args: { ...executeArgs, _confirmationToken: token },
      principal: { kind: 'agent', agentId: 'a1', subject: 'agent:a1' },
      functionRef: 'tasks:delete',
      operation: 'mutation',
      purpose: 'operation-execute',
      jti: 'envelope-jti',
    })

    await expect(
      definition.handler(
        {
          auth: { getUserIdentity: async () => null },
          db: memory.db,
          observe: async () => {},
        },
        args,
      ),
    ).rejects.toThrow(/operation-execute envelope does not match the confirmation token/i)

    expect(executed).toBe(false)
    expect(memory.tables.destructiveRedemptions ?? []).toHaveLength(0)
    expect(memory.tables.destructiveAuditLog ?? []).toHaveLength(0)
  })

  it('reports destructive safety misconfiguration before destructive handler execution', async () => {
    process.env.TRELLIS_MCP_CONFIRMATION_KEY = 'test-mcp-confirmation-key'
    const builder = ((definition: unknown) => definition) as never
    const runtime = defineTrellis(
      {
        query: builder,
        mutation: builder,
      },
      {
        destructiveSafety: {
          redemptionTable: 'destructiveRedemptions' as never,
          auditTable: 'destructiveAuditLog' as never,
        },
      },
    )

    let executed = false
    const destructiveOp = defineOperation({
      id: 'tests.destroy',
      kind: 'destructive',
      args: {
        id: v.string(),
      },
      guard: open,
      preview: async (_ctx, args) => ({
        display: { summary: `Destroy ${args.id}` },
        confirm: { id: args.id },
      }),
      handler: async () => {
        executed = true
        return 'destroyed'
      },
    })

    const definition = runtime.mutation(destructiveOp) as {
      handler: (
        ctx: {
          auth: { getUserIdentity: () => Promise<null> }
          db: Record<string, never>
          observe: (event: Record<string, unknown>) => Promise<void>
        },
        args: { id: string; _confirmationToken: string },
      ) => Promise<unknown>
    }
    const executeArgs = { id: 'record-1' }
    const token = await confirmationToken({
      operationId: 'tests.destroy',
      executeArgs,
      confirm: { id: 'record-1' },
      jti: 'misconfigured-store',
    })

    await expect(
      definition.handler(
        {
          auth: { getUserIdentity: async () => null },
          db: {},
          observe: async () => {},
        },
        { ...executeArgs, _confirmationToken: token },
      ),
    ).rejects.toThrow(
      /Destructive safety for operation "tests.destroy" is misconfigured.*destructiveRedemptions.*by_jti.*destructiveAuditLog/i,
    )

    expect(executed).toBe(false)
  })

  it('re-runs authorization after destructive confirmation before redeeming', async () => {
    process.env.TRELLIS_MCP_CONFIRMATION_KEY = 'test-mcp-confirmation-key'
    const builder = ((definition: unknown) => definition) as never
    const runtime = defineTrellis(
      {
        query: builder,
        mutation: builder,
      },
      {
        destructiveSafety: {
          redemptionTable: 'destructiveRedemptions' as never,
          auditTable: 'destructiveAuditLog' as never,
        },
      },
    )

    let authorized = true
    let executed = false
    const destructiveOp = defineOperation({
      id: 'tests.destroy',
      kind: 'destructive',
      args: {
        id: v.string(),
      },
      guard: open,
      authorize: {
        label: 'tests.destroy',
        check: async () => authorized,
      },
      preview: async (_ctx, args) => ({
        display: { summary: 'Destroy test record' },
        confirm: { id: args.id },
      }),
      handler: async () => {
        executed = true
        return 'destroyed'
      },
    })

    const definition = runtime.mutation(destructiveOp) as {
      handler: (
        ctx: {
          auth: { getUserIdentity: () => Promise<null> }
          db: ReturnType<typeof createMemoryDb>['db']
          observe: (event: Record<string, unknown>) => Promise<void>
        },
        args: { id: string; _confirmationToken: string },
      ) => Promise<unknown>
    }
    const memory = createMemoryDb()
    const executeArgs = { id: 'record-1' }
    const token = await confirmationToken({
      operationId: 'tests.destroy',
      executeArgs,
      confirm: { id: 'record-1' },
      jti: 'auth-recheck',
    })

    authorized = false

    await expect(
      definition.handler(
        {
          auth: { getUserIdentity: async () => null },
          db: memory.db,
          observe: async () => {},
        },
        { ...executeArgs, _confirmationToken: token },
      ),
    ).rejects.toThrow(/tests\.destroy|Access denied|Forbidden/i)

    expect(executed).toBe(false)
    expect(memory.tables.destructiveRedemptions ?? []).toHaveLength(0)
    expect(memory.tables.destructiveAuditLog ?? []).toHaveLength(0)
  })

  it('rejects stale destructive operation confirmation tokens when preview state changes', async () => {
    process.env.TRELLIS_MCP_CONFIRMATION_KEY = 'test-mcp-confirmation-key'
    const builder = ((definition: unknown) => definition) as never
    const runtime = defineTrellis(
      {
        query: builder,
        mutation: builder,
      },
      {
        destructiveSafety: {
          redemptionTable: 'destructiveRedemptions' as never,
          auditTable: 'destructiveAuditLog' as never,
        },
      },
    )

    let state = 'draft'
    let executions = 0
    const destructiveOp = defineOperation({
      id: 'tests.destroy',
      kind: 'destructive',
      args: {
        id: v.string(),
      },
      guard: open,
      preview: async (_ctx, args) => ({
        display: { summary: `Destroy ${args.id}` },
        confirm: { operation: 'tests.destroy', id: args.id, state },
        version: { state },
      }),
      handler: async () => {
        executions += 1
        return 'destroyed'
      },
    })

    const definition = runtime.mutation(destructiveOp) as {
      handler: (
        ctx: {
          auth: { getUserIdentity: () => Promise<null> }
          db: ReturnType<typeof createMemoryDb>['db']
          observe: (event: Record<string, unknown>) => Promise<void>
        },
        args: { id: string; _confirmationToken: string },
      ) => Promise<unknown>
    }
    const memory = createMemoryDb()
    const executeArgs = { id: 'record-1' }
    const token = await confirmationToken({
      operationId: 'tests.destroy',
      executeArgs,
      confirm: { operation: 'tests.destroy', id: 'record-1', state: 'draft' },
      version: { state: 'draft' },
      jti: 'jti-stale-test',
    })

    state = 'published'

    await expect(
      definition.handler(
        {
          auth: { getUserIdentity: async () => null },
          db: memory.db,
          observe: async () => {},
        },
        { ...executeArgs, _confirmationToken: token },
      ),
    ).rejects.toThrow(/changed before confirmation/i)

    expect(executions).toBe(0)
    expect(memory.tables.destructiveRedemptions ?? []).toHaveLength(0)
    expect(memory.tables.destructiveAuditLog ?? []).toHaveLength(0)
  })
})
