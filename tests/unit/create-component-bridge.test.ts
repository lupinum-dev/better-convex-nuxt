import { v } from 'convex/values'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { customMutationMock, customQueryMock } = vi.hoisted(() => ({
  customQueryMock: vi.fn((_builder, customization) => (definition) => ({
    customization,
    definition,
  })),
  customMutationMock: vi.fn((_builder, customization) => (definition) => ({
    customization,
    definition,
  })),
}))

vi.mock('convex-helpers/server/customFunctions', () => ({
  customQuery: customQueryMock,
  customMutation: customMutationMock,
}))

describe('createComponentBridge', () => {
  afterEach(() => {
    delete process.env.CONVEX_TRUSTED_CALLER_KEY
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('forwards the resolved principal unchanged for internal query bridges', async () => {
    process.env.CONVEX_TRUSTED_CALLER_KEY = 'bridge-secret'
    const { createComponentBridge, definePrincipal } = await import('../../src/runtime/functions')

    const principal = { kind: 'service', service: 'mcp' } as const
    const bridge = createComponentBridge(
      {
        query: (() => null as never) as never,
        mutation: (() => null as never) as never,
        internalQuery: (() => null as never) as never,
        internalMutation: (() => null as never) as never,
      },
      {
        principal: definePrincipal({
          validator: v.object({
            kind: v.literal('service'),
            service: v.string(),
          }),
          resolve: async (_ctx, args) =>
            (args as { principal?: typeof principal }).principal ?? principal,
        }),
      },
    )

    const registered = bridge.internalQuery({
      component: 'component.query' as never,
      args: { slug: v.string() },
    }) as {
      customization: {
        input: (
          ctx: unknown,
          args: unknown,
        ) => Promise<{ ctx: { principal: () => Promise<typeof principal> } }>
      }
      definition: {
        handler: (
          ctx: {
            principal: () => Promise<typeof principal>
            runQuery: (component: string, args: unknown) => Promise<unknown>
          },
          args: { slug: string },
        ) => Promise<unknown>
      }
    }

    const runQuery = vi.fn(async () => ({ ok: true }))
    const customized = await registered.customization.input({ runQuery }, { principal })

    await registered.definition.handler(
      {
        ...customized.ctx,
        runQuery,
      },
      { slug: 'docs' },
    )

    expect(runQuery).toHaveBeenCalledWith('component.query', {
      slug: 'docs',
      _trustedCallerKey: 'bridge-secret',
      _trustedCaller: {
        userId: 'component-bridge',
      },
      principal,
    })
  })

  it('forwards the resolved principal unchanged when bridge entries are declared in batch', async () => {
    process.env.CONVEX_TRUSTED_CALLER_KEY = 'bridge-secret'
    const { createComponentBridge, definePrincipal } = await import('../../src/runtime/functions')

    const principal = { kind: 'service', service: 'mcp' } as const
    const bridge = createComponentBridge(
      {
        query: (() => null as never) as never,
        mutation: (() => null as never) as never,
        internalQuery: (() => null as never) as never,
        internalMutation: (() => null as never) as never,
      },
      {
        principal: definePrincipal({
          validator: v.object({
            kind: v.literal('service'),
            service: v.string(),
          }),
          resolve: async (_ctx, args) =>
            (args as { principal?: typeof principal }).principal ?? principal,
        }),
      },
    )

    const registered = bridge.from({
      loadDocs: {
        operation: 'internalQuery',
        component: 'component.query' as never,
        args: { slug: v.string() },
      },
    }).loadDocs as {
      customization: {
        input: (
          ctx: unknown,
          args: unknown,
        ) => Promise<{ ctx: { principal: () => Promise<typeof principal> } }>
      }
      definition: {
        handler: (
          ctx: {
            principal: () => Promise<typeof principal>
            runQuery: (component: string, args: unknown) => Promise<unknown>
          },
          args: { slug: string },
        ) => Promise<unknown>
      }
    }

    const runQuery = vi.fn(async () => ({ ok: true }))
    const customized = await registered.customization.input({ runQuery }, { principal })

    await registered.definition.handler(
      {
        ...customized.ctx,
        runQuery,
      },
      { slug: 'docs' },
    )

    expect(runQuery).toHaveBeenCalledWith('component.query', {
      slug: 'docs',
      _trustedCallerKey: 'bridge-secret',
      _trustedCaller: {
        userId: 'component-bridge',
      },
      principal,
    })
  })

  it('fails closed when no trusted caller key is configured', async () => {
    const { createComponentBridge, definePrincipal } = await import('../../src/runtime/functions')

    const bridge = createComponentBridge(
      {
        query: (() => null as never) as never,
        mutation: (() => null as never) as never,
        internalQuery: (() => null as never) as never,
        internalMutation: (() => null as never) as never,
      },
      {
        principal: definePrincipal({
          validator: v.object({
            kind: v.literal('service'),
            service: v.string(),
          }),
          resolve: async (_ctx, args) => (args as { principal?: { kind: 'service' } }).principal!,
        }),
      },
    )

    const registered = bridge.internalQuery({
      component: 'component.query' as never,
      args: { slug: v.string() },
    }) as {
      customization: {
        input: (ctx: unknown, args: unknown) => Promise<unknown>
      }
    }

    await expect(
      registered.definition.handler(
        {
          ...(await registered.customization.input(
            { runQuery: vi.fn() },
            { principal: { kind: 'service' } },
          )).ctx,
          runQuery: vi.fn(),
        },
        { slug: 'docs' },
      ),
    ).rejects.toThrow(/CONVEX_TRUSTED_CALLER_KEY/)
  })
})
