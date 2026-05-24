import { v } from 'convex/values'
import { afterEach, describe, expect, it } from 'vitest'

import { open } from '../../src/runtime/auth'
import { defineTrellis, trellisBackendLaneMetadataKey, unsafe } from '../../src/runtime/backend'
import {
  createConfirmationToken,
  hashConfirmationValue,
  hashConfirmationToken,
} from '../../src/runtime/functions/confirmation-token'
import {
  defineOperation,
  operationPreview,
  previewOf,
  transportExecuteOperationRef,
} from '../../src/runtime/functions/define-operation'
import { createIdentityForwardingEnvelopeArgs } from '../../src/runtime/identity-forwarding/shared'
import { createObservationCapture } from '../../src/runtime/testing'

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
        const id = `${table}:${tables[table].length + 1}`
        tables[table].push({ _id: id, ...value })
        return id
      },
      patch: async (id: string, value: MemoryRow) => {
        for (const rows of Object.values(tables)) {
          const row = rows.find((candidate) => candidate._id === id)
          if (row) {
            Object.assign(row, value)
            return null
          }
        }
        throw new Error(`Missing row "${id}"`)
      },
    },
  }
}

async function confirmationToken(args: {
  memory: ReturnType<typeof createMemoryDb>
  operationId: string
  executeArgs: Record<string, unknown>
  confirm: Record<string, unknown>
  version?: unknown
  jti: string
  executePath?: string
  previewPath?: string
}) {
  const token = createConfirmationToken()
  await args.memory.db.insert('destructiveConfirmations', {
    tokenHash: await hashConfirmationToken(token),
    operationId: args.operationId,
    executePath: args.executePath ?? 'execute',
    previewPath: args.previewPath ?? 'preview',
    jti: args.jti,
    callerKey: 'caller:test',
    scopeKey: 'tenant:test',
    argsHash: await hashConfirmationValue(args.executeArgs),
    previewHash: await hashConfirmationValue(args.confirm),
    ...(args.version === undefined
      ? {}
      : { versionHash: await hashConfirmationValue(args.version) }),
    createdAt: Date.now(),
    expiresAt: Date.now() + 5 * 60 * 1000,
  })
  return token
}

describe('defineTrellis', () => {
  const originalIdentityForwardingKey = process.env.CONVEX_IDENTITY_FORWARDING_KEY

  afterEach(() => {
    if (originalIdentityForwardingKey === undefined) {
      delete process.env.CONVEX_IDENTITY_FORWARDING_KEY
    } else {
      process.env.CONVEX_IDENTITY_FORWARDING_KEY = originalIdentityForwardingKey
    }
  })

  it('exposes explicit backend lanes and unsafe escape hatches', () => {
    const builder = () => null as never

    const runtime = defineTrellis(
      {
        query: builder,
        mutation: builder,
      },
      {
        destructiveOperations: {
          confirmationTable: 'destructiveConfirmations' as never,
          auditTable: 'destructiveAuditLog' as never,
        },
      },
    )

    expect(runtime.query).toBeTypeOf('object')
    expect(runtime.mutation).toBeTypeOf('object')
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

  it('does not expose callable root backend builders', () => {
    const builder = ((definition: unknown) => definition) as never

    const runtime = defineTrellis(
      {
        query: builder,
        mutation: builder,
      },
      {
        destructiveOperations: {
          confirmationTable: 'destructiveConfirmations' as never,
          auditTable: 'destructiveAuditLog' as never,
        },
      },
    )

    expect(runtime.query).not.toBeTypeOf('function')
    expect(runtime.mutation).not.toBeTypeOf('function')
    expect(() => (runtime.query as unknown as (definition: unknown) => unknown)({})).toThrow(
      /runtime\.query is not a function|is not a function/i,
    )
    expect(() => (runtime.mutation as unknown as (definition: unknown) => unknown)({})).toThrow(
      /runtime\.mutation is not a function|is not a function/i,
    )
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
      permit: unsafe.permit({
        kind: 'testSetup',
        reason: 'test setup',
        scope: ['tests'],
      }),
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
    process.env.CONVEX_IDENTITY_FORWARDING_KEY = 'trusted-key-with-enough-alpha-entropy'
    const builder = ((definition: unknown) => definition) as never
    const runtime = defineTrellis({
      query: builder,
      mutation: builder,
    })

    const definition = runtime.query.public({
      args: {
        title: v.string(),
      },
      identityForwardingFunctionRef: 'posts:create',
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

    const args = createIdentityForwardingEnvelopeArgs({
      args: { title: 'Hello' },
      caller: { kind: 'agent', agentId: 'a1', subject: 'agent:a1' },
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
    process.env.CONVEX_IDENTITY_FORWARDING_KEY = 'trusted-key-with-enough-alpha-entropy'
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

    const args = createIdentityForwardingEnvelopeArgs({
      args: { title: 'Hello' },
      caller: { kind: 'agent', agentId: 'a1', subject: 'agent:a1' },
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
    ).rejects.toThrow(/identityForwardingFunctionRef metadata/)
  })

  it('uses projected operation function-ref metadata for identity forwarding verification', async () => {
    process.env.CONVEX_IDENTITY_FORWARDING_KEY = 'trusted-key-with-enough-alpha-entropy'
    const builder = ((definition: unknown) => definition) as never
    const runtime = defineTrellis(
      {
        query: builder,
        mutation: builder,
      },
      {
        destructiveOperations: {
          confirmationTable: 'destructiveConfirmations' as never,
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
      preview: async (_ctx, args) =>
        operationPreview({ summary: `Delete ${args.id}`, confirm: { id: args.id } }),
      handler: async () => ({ deleted: true }),
    })
    const definition = runtime.mutation.protected(
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
    const args = createIdentityForwardingEnvelopeArgs({
      args: { id: 'task_1' },
      caller: { kind: 'agent', agentId: 'a1', subject: 'agent:a1' },
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

  it('requires trusted operation-execute forwarding for destructive transport mutations', async () => {
    const builder = ((definition: unknown) => definition) as never
    const runtime = defineTrellis(
      {
        query: builder,
        mutation: builder,
      },
      {
        destructiveOperations: {
          confirmationTable: 'destructiveConfirmations' as never,
          auditTable: 'destructiveAuditLog' as never,
        },
      },
    )

    let executed = false
    const operation = defineOperation({
      id: 'tasks.delete.transport',
      kind: 'destructive',
      args: {
        id: v.string(),
      },
      guard: open,
      preview: async (_ctx, args) =>
        operationPreview({ summary: `Delete ${args.id}`, confirm: { id: args.id } }),
      handler: async () => {
        executed = true
        return { deleted: true }
      },
    })

    process.env.CONVEX_IDENTITY_FORWARDING_KEY = 'trusted-key-with-enough-alpha-entropy'
    const definition = runtime.transportMutation(
      transportExecuteOperationRef(operation, operation, {
        functionRef: 'tasks:delete',
      }) as never,
    ) as {
      handler: (
        ctx: {
          auth: { getUserIdentity: () => Promise<null> }
          db: ReturnType<typeof createMemoryDb>['db']
          observe: (event: Record<string, unknown>) => Promise<void>
        },
        args: Record<string, unknown>,
        loaded?: unknown,
      ) => Promise<unknown>
    }

    await expect(
      definition.handler(
        {
          auth: { getUserIdentity: async () => null },
          db: createMemoryDb().db,
          observe: async () => {},
        },
        { id: 'task_1' },
      ),
    ).rejects.toThrow(/operation-execute forwarding envelope/)
    expect(executed).toBe(false)

    await expect(
      definition.handler(
        {
          auth: { getUserIdentity: async () => null },
          db: createMemoryDb().db,
          observe: async () => {},
        },
        createIdentityForwardingEnvelopeArgs({
          args: { id: 'task_1' },
          caller: { kind: 'agent', agentId: 'a1', subject: 'agent:a1' },
          functionRef: 'tasks:delete',
          operation: 'mutation',
          purpose: 'operation-execute',
          jti: 'execute-1',
        }),
      ),
    ).resolves.toEqual({ deleted: true })
  })

  it('rejects replayed operation-execute forwarding envelopes before handler execution', async () => {
    process.env.CONVEX_IDENTITY_FORWARDING_KEY = 'trusted-key-with-enough-alpha-entropy'
    const builder = ((definition: unknown) => definition) as never
    const runtime = defineTrellis(
      {
        query: builder,
        mutation: builder,
      },
      {
        destructiveOperations: {
          confirmationTable: 'destructiveConfirmations' as never,
          auditTable: 'destructiveAuditLog' as never,
        },
      },
    )

    let executed = false
    const definition = runtime.mutation.public({
      args: {
        id: v.string(),
      },
      identityForwardingFunctionRef: 'tasks:delete',
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
    memory.tables.destructiveConfirmations = [{ jti: 'execute-1', redeemedAt: 1 }]
    const args = createIdentityForwardingEnvelopeArgs({
      args: { id: 'task_1' },
      caller: { kind: 'agent', agentId: 'a1', subject: 'agent:a1' },
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
    process.env.CONVEX_IDENTITY_FORWARDING_KEY = 'trusted-key-with-enough-alpha-entropy'
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
      identityForwardingFunctionRef: 'tasks:delete',
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

    const args = createIdentityForwardingEnvelopeArgs({
      args: { id: 'task_1' },
      caller: { kind: 'agent', agentId: 'a1', subject: 'agent:a1' },
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
    ).rejects.toThrow(/operation-execute envelopes require destructive safety confirmation/i)
    expect(executed).toBe(false)
  })

  it('reports destructive safety misconfiguration for operation-execute envelope replay checks', async () => {
    process.env.CONVEX_IDENTITY_FORWARDING_KEY = 'trusted-key-with-enough-alpha-entropy'
    const builder = ((definition: unknown) => definition) as never
    const runtime = defineTrellis(
      {
        query: builder,
        mutation: builder,
      },
      {
        destructiveOperations: {
          confirmationTable: 'destructiveConfirmations' as never,
          auditTable: 'destructiveAuditLog' as never,
        },
      },
    )

    let executed = false
    const definition = runtime.mutation.public({
      args: {
        id: v.string(),
      },
      identityForwardingFunctionRef: 'tasks:delete',
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

    const args = createIdentityForwardingEnvelopeArgs({
      args: { id: 'task_1' },
      caller: { kind: 'agent', agentId: 'a1', subject: 'agent:a1' },
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
      /Destructive safety for operation "tasks:delete" is misconfigured.*destructiveConfirmations.*by_jti.*destructiveAuditLog/i,
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

    expect(runtime.internalQuery).toBeTypeOf('object')
    expect(runtime.internalQuery?.protected).toBeTypeOf('function')
    expect(runtime.internalMutation).toBeTypeOf('object')
    expect(runtime.internalMutation?.protected).toBeTypeOf('function')
  })

  it('forwards action builders when provided', () => {
    const builder = () => null as never

    const runtime = defineTrellis({
      query: builder,
      mutation: builder,
      action: builder,
    })

    expect(runtime.action).toBeTypeOf('object')
    expect(runtime.action?.protected).toBeTypeOf('function')
    expect(runtime.unsafe.action).toBeTypeOf('function')
  })

  it('requires a typed permit for unsafe builders', () => {
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
    ).toThrow(/unsafe\.query\(\{ permit \}\): unsafe handlers require unsafe\.permit\(\.\.\.\)/i)
  })

  it('emits an unsafe handler event with typed permit metadata', async () => {
    const builder = ((definition: unknown) => definition) as never
    const capture = createObservationCapture()

    const runtime = defineTrellis({
      query: builder,
      mutation: builder,
    })

    const definition = runtime.unsafe.query({
      permit: unsafe.permit({
        kind: 'publicCatalog',
        reason: 'Public catalog listing is intentionally unauthenticated.',
        scope: ['runbooks'],
        reviewBy: '2026-07-01',
      }),
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
          kind: 'publicCatalog',
          reason: 'Public catalog listing is intentionally unauthenticated.',
          reviewBy: '2026-07-01',
          scope: ['runbooks'],
          surface: 'unsafe.query',
        },
      }),
    )
    capture.stop()
  })

  it('rejects destructive operation registration when destructiveOperations is missing', () => {
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
      preview: async () =>
        operationPreview({
          summary: 'Destroy test record',
          confirm: { operation: 'tests.destroy' },
        }),
      handler: async () => null,
    })

    expect(() => runtime.mutation.protected(destructiveOp)).toThrow(/destructiveOperations/)
  })

  it('requires confirmation before executing destructive operation mutations', async () => {
    const builder = ((definition: unknown) => definition) as never
    const runtime = defineTrellis(
      {
        query: builder,
        mutation: builder,
      },
      {
        destructiveOperations: {
          confirmationTable: 'destructiveConfirmations' as never,
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
      preview: async () =>
        operationPreview({
          summary: 'Destroy test record',
          confirm: { operation: 'tests.destroy' },
        }),
      handler: async () => 'destroyed',
    })

    const definition = runtime.mutation.protected(destructiveOp) as {
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
    const builder = ((definition: unknown) => definition) as never
    const runtime = defineTrellis(
      {
        query: builder,
        mutation: builder,
      },
      {
        destructiveOperations: {
          confirmationTable: 'destructiveConfirmations' as never,
          auditTable: 'destructiveAuditLog' as never,
          previewConfirmation: {
            callerKey: () => 'caller:test',
            scopeKey: () => 'tenant:test',
          },
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
      preview: async (_ctx, args) =>
        operationPreview({
          summary: `Destroy ${args.id}`,
          confirm: { operation: 'tests.destroy', id: args.id },
        }),
      handler: async () => {
        executions += 1
        return 'destroyed'
      },
    })

    const definition = runtime.mutation.protected(destructiveOp) as {
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
      memory,
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
    expect(memory.tables.destructiveConfirmations).toHaveLength(1)
    expect(memory.tables.destructiveAuditLog).toHaveLength(1)
  })

  it('attaches confirmation tokens to destructive operation previews when configured', async () => {
    const builder = ((definition: unknown) => definition) as never
    const runtime = defineTrellis(
      {
        query: builder,
        mutation: builder,
      },
      {
        destructiveOperations: {
          confirmationTable: 'destructiveConfirmations' as never,
          auditTable: 'destructiveAuditLog' as never,
          previewConfirmation: {
            callerKey: () => 'caller:test',
            scopeKey: () => 'tenant:test',
            ttlSeconds: 60,
          },
        },
      },
    )

    const destructiveOp = defineOperation({
      id: 'tests.preview-token',
      kind: 'destructive',
      args: {
        id: v.string(),
      },
      identityForwardingFunctionRef: 'tasks:delete',
      guard: open,
      preview: async (_ctx, args) =>
        operationPreview({
          summary: `Destroy ${args.id}`,
          confirm: { operation: 'tests.preview-token', id: args.id },
          version: { id: args.id, version: 1 },
        }),
      handler: async () => 'destroyed',
    })

    const previewDefinition = runtime.mutation.protected({
      ...previewOf(destructiveOp),
      identityForwardingFunctionRef: 'tasks:previewDelete',
    }) as {
      handler: (
        ctx: {
          auth: { getUserIdentity: () => Promise<null> }
          db: ReturnType<typeof createMemoryDb>['db']
          observe: (event: Record<string, unknown>) => Promise<void>
        },
        args: { id: string },
      ) => Promise<{ confirmation?: { token: string; expiresAt: number } }>
    }
    const executeDefinition = runtime.mutation.protected(destructiveOp) as {
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
    const ctx = {
      auth: { getUserIdentity: async () => null },
      db: memory.db,
      observe: async () => {},
    }
    const preview = await previewDefinition.handler(ctx, { id: 'record-1' })

    expect(preview.confirmation?.token).toEqual(expect.any(String))
    expect(preview.confirmation?.expiresAt).toBeGreaterThan(Date.now())
    expect(memory.tables.destructiveConfirmations).toHaveLength(1)
    expect(memory.tables.destructiveConfirmations[0]).not.toHaveProperty(
      'token',
      preview.confirmation?.token,
    )
    await expect(
      executeDefinition.handler(ctx, {
        id: 'record-1',
        _confirmationToken: preview.confirmation!.token,
      }),
    ).resolves.toBe('destroyed')
    await expect(
      executeDefinition.handler(ctx, {
        id: 'record-1',
        _confirmationToken: preview.confirmation!.token,
      }),
    ).rejects.toThrow(/already been redeemed/i)
  })

  it('rejects query previews that try to issue stored destructive confirmations', () => {
    const builder = ((definition: unknown) => definition) as never
    const runtime = defineTrellis(
      {
        query: builder,
        mutation: builder,
      },
      {
        destructiveOperations: {
          confirmationTable: 'destructiveConfirmations' as never,
          auditTable: 'destructiveAuditLog' as never,
          previewConfirmation: {
            callerKey: () => 'caller:test',
            scopeKey: () => 'tenant:test',
          },
        },
      },
    )

    const destructiveOp = defineOperation({
      id: 'tests.query-preview-token',
      kind: 'destructive',
      args: {
        id: v.string(),
      },
      identityForwardingFunctionRef: 'tasks:delete',
      guard: open,
      preview: async (_ctx, args) =>
        operationPreview({
          summary: `Destroy ${args.id}`,
          confirm: { operation: 'tests.query-preview-token', id: args.id },
        }),
      handler: async () => 'destroyed',
    })

    expect(() =>
      runtime.query.protected({
        ...previewOf(destructiveOp),
        identityForwardingFunctionRef: 'tasks:previewDelete',
      }),
    ).toThrow(/cannot issue confirmation tokens.*mutation\(previewOf\(op\)\)/i)
  })

  it('requires operation-execute forwarding and confirmation tokens to share the same jti', async () => {
    process.env.CONVEX_IDENTITY_FORWARDING_KEY = 'trusted-key-with-enough-alpha-entropy'
    const builder = ((definition: unknown) => definition) as never
    const runtime = defineTrellis(
      {
        query: builder,
        mutation: builder,
      },
      {
        destructiveOperations: {
          confirmationTable: 'destructiveConfirmations' as never,
          auditTable: 'destructiveAuditLog' as never,
          previewConfirmation: {
            callerKey: () => 'caller:test',
            scopeKey: () => 'tenant:test',
          },
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
      identityForwardingFunctionRef: 'tasks:delete',
      guard: open,
      preview: async (_ctx, args) =>
        operationPreview({ summary: `Destroy ${args.id}`, confirm: { id: args.id } }),
      handler: async () => {
        executed = true
        return 'destroyed'
      },
    })

    const definition = runtime.mutation.protected(destructiveOp) as {
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
      memory,
      operationId: 'tests.destroy',
      executeArgs,
      confirm: { id: 'record-1' },
      jti: 'confirmation-jti',
      executePath: 'tasks:delete',
    })
    const args = createIdentityForwardingEnvelopeArgs({
      args: { ...executeArgs, _confirmationToken: token },
      caller: { kind: 'agent', agentId: 'a1', subject: 'agent:a1' },
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
    expect(memory.tables.destructiveConfirmations ?? []).toHaveLength(1)
    expect(memory.tables.destructiveAuditLog ?? []).toHaveLength(0)
  })

  it('reports destructive safety misconfiguration before destructive handler execution', async () => {
    const builder = ((definition: unknown) => definition) as never
    const runtime = defineTrellis(
      {
        query: builder,
        mutation: builder,
      },
      {
        destructiveOperations: {
          confirmationTable: 'destructiveConfirmations' as never,
          auditTable: 'destructiveAuditLog' as never,
          previewConfirmation: {
            callerKey: () => 'caller:test',
            scopeKey: () => 'tenant:test',
          },
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
      preview: async (_ctx, args) =>
        operationPreview({ summary: `Destroy ${args.id}`, confirm: { id: args.id } }),
      handler: async () => {
        executed = true
        return 'destroyed'
      },
    })

    const definition = runtime.mutation.protected(destructiveOp) as {
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
    const token = createConfirmationToken()

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
      /Destructive safety for operation "tests.destroy" is misconfigured.*destructiveConfirmations.*by_token_hash.*by_jti.*destructiveAuditLog/i,
    )

    expect(executed).toBe(false)
  })

  it('re-runs authorization after destructive confirmation before redeeming', async () => {
    const builder = ((definition: unknown) => definition) as never
    const runtime = defineTrellis(
      {
        query: builder,
        mutation: builder,
      },
      {
        destructiveOperations: {
          confirmationTable: 'destructiveConfirmations' as never,
          auditTable: 'destructiveAuditLog' as never,
          previewConfirmation: {
            callerKey: () => 'caller:test',
            scopeKey: () => 'tenant:test',
          },
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
      preview: async (_ctx, args) =>
        operationPreview({ summary: 'Destroy test record', confirm: { id: args.id } }),
      handler: async () => {
        executed = true
        return 'destroyed'
      },
    })

    const definition = runtime.mutation.protected(destructiveOp) as {
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
      memory,
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
    expect(memory.tables.destructiveConfirmations ?? []).toHaveLength(1)
    expect(memory.tables.destructiveAuditLog ?? []).toHaveLength(0)
  })

  it('rejects stale destructive operation confirmation tokens when preview state changes', async () => {
    const builder = ((definition: unknown) => definition) as never
    const runtime = defineTrellis(
      {
        query: builder,
        mutation: builder,
      },
      {
        destructiveOperations: {
          confirmationTable: 'destructiveConfirmations' as never,
          auditTable: 'destructiveAuditLog' as never,
          previewConfirmation: {
            callerKey: () => 'caller:test',
            scopeKey: () => 'tenant:test',
          },
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
      preview: async (_ctx, args) =>
        operationPreview({
          summary: `Destroy ${args.id}`,
          confirm: { operation: 'tests.destroy', id: args.id, state },
          version: { state },
        }),
      handler: async () => {
        executions += 1
        return 'destroyed'
      },
    })

    const definition = runtime.mutation.protected(destructiveOp) as {
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
      memory,
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
    expect(memory.tables.destructiveConfirmations ?? []).toHaveLength(1)
    expect(memory.tables.destructiveAuditLog ?? []).toHaveLength(0)
  })
})
