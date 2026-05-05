import { v } from 'convex/values'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { customActionMock, customMutationMock, customQueryMock } = vi.hoisted(() => ({
  customActionMock: vi.fn((_builder, customization) => (definition) => ({
    customization,
    definition,
  })),
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
  customAction: customActionMock,
  customQuery: customQueryMock,
  customMutation: customMutationMock,
}))

const originalNodeEnv = process.env.NODE_ENV

describe('createComponentBridge', () => {
  afterEach(() => {
    delete process.env.CONVEX_TRUSTED_FORWARDING_KEY
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = originalNodeEnv
    }
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('forwards the resolved principal unchanged for internal query bridges', async () => {
    process.env.CONVEX_TRUSTED_FORWARDING_KEY = 'bridge-secret'
    const { createComponentBridge, definePrincipal } = await import('../../src/runtime/functions')

    const principal = { kind: 'service', serviceId: 'mcp', subject: 'service:mcp' } as const
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
            serviceId: v.string(),
            subject: v.string(),
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
      _trustedForwardingKey: 'bridge-secret',
      _trustedForwarding: {
        principalSubject: 'service:mcp',
      },
      principal,
    })
  })

  it('forwards the resolved principal unchanged for internal action bridges', async () => {
    process.env.CONVEX_TRUSTED_FORWARDING_KEY = 'bridge-secret'
    const { createComponentBridge, definePrincipal } = await import('../../src/runtime/functions')

    const principal = { kind: 'service', serviceId: 'mcp', subject: 'service:mcp' } as const
    const bridge = createComponentBridge(
      {
        query: (() => null as never) as never,
        mutation: (() => null as never) as never,
        action: (() => null as never) as never,
        internalQuery: (() => null as never) as never,
        internalMutation: (() => null as never) as never,
        internalAction: (() => null as never) as never,
      },
      {
        principal: definePrincipal({
          validator: v.object({
            kind: v.literal('service'),
            serviceId: v.string(),
            subject: v.string(),
          }),
          resolve: async (_ctx, args) =>
            (args as { principal?: typeof principal }).principal ?? principal,
        }),
      },
    )

    const registered = bridge.internalAction!({
      component: 'component.action' as never,
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
            runAction: (component: string, args: unknown) => Promise<unknown>
          },
          args: { slug: string },
        ) => Promise<unknown>
      }
    }

    const runAction = vi.fn(async () => ({ ok: true }))
    const customized = await registered.customization.input({ runAction }, { principal })

    await registered.definition.handler(
      {
        ...customized.ctx,
        runAction,
      },
      { slug: 'docs' },
    )

    expect(runAction).toHaveBeenCalledWith('component.action', {
      slug: 'docs',
      _trustedForwardingKey: 'bridge-secret',
      _trustedForwarding: {
        principalSubject: 'service:mcp',
      },
      principal,
    })
  })

  it('rejects caller-supplied principal on public query bridges', async () => {
    process.env.CONVEX_TRUSTED_FORWARDING_KEY = 'bridge-secret'
    const { createComponentBridge, definePrincipal } = await import('../../src/runtime/functions')
    const { getForwardedPrincipal } = await import('../../src/runtime/trusted-forwarding')

    const trustedPrincipal = {
      kind: 'service',
      serviceId: 'server-owned',
      subject: 'service:server-owned',
    } as const
    const attackerPrincipal = {
      kind: 'service',
      serviceId: 'attacker',
      subject: 'service:attacker',
    } as const
    const resolvePrincipal = vi.fn(async (ctx, args) => {
      return (
        getForwardedPrincipal<typeof trustedPrincipal>(ctx as never, args as never) ??
        trustedPrincipal
      )
    })

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
            serviceId: v.string(),
            subject: v.string(),
          }),
          resolve: resolvePrincipal,
        }),
      },
    )

    const registered = bridge.query({
      component: 'component.query' as never,
      args: { slug: v.string() },
    }) as {
      customization: {
        args: Record<string, never>
        input: (
          ctx: unknown,
          args: unknown,
        ) => Promise<{ ctx: { principal: () => Promise<typeof trustedPrincipal> } }>
      }
    }

    expect(registered.customization.args).toEqual({})

    const customized = await registered.customization.input(
      { runQuery: vi.fn() },
      {
        principal: attackerPrincipal,
      },
    )

    await expect(customized.ctx.principal()).rejects.toThrow(
      /Forwarded `principal` is only allowed on verified trusted forwarding paths/,
    )
    expect(resolvePrincipal).toHaveBeenCalled()
  })

  it('forwards the resolved principal unchanged when bridge entries are declared in batch', async () => {
    process.env.CONVEX_TRUSTED_FORWARDING_KEY = 'bridge-secret'
    const { createComponentBridge, definePrincipal } = await import('../../src/runtime/functions')

    const principal = { kind: 'service', serviceId: 'mcp', subject: 'service:mcp' } as const
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
            serviceId: v.string(),
            subject: v.string(),
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
      _trustedForwardingKey: 'bridge-secret',
      _trustedForwarding: {
        principalSubject: 'service:mcp',
      },
      principal,
    })
  })

  it('fails closed when no trusted forwarding key is configured', async () => {
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
            serviceId: v.string(),
            subject: v.string(),
          }),
          resolve: async (_ctx, args) =>
            (args as { principal?: { kind: 'service'; serviceId: string; subject: string } })
              .principal!,
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
          ...(
            await registered.customization.input(
              { runQuery: vi.fn() },
              { principal: { kind: 'service', serviceId: 'mcp', subject: 'service:mcp' } },
            )
          ).ctx,
          runQuery: vi.fn(),
        },
        { slug: 'docs' },
      ),
    ).rejects.toThrow(/CONVEX_TRUSTED_FORWARDING_KEY/)
  })

  it('uses an explicit trusted forwarding key without reading process env', async () => {
    const { createComponentBridge, definePrincipal } = await import('../../src/runtime/functions')

    const principal = { kind: 'service', serviceId: 'mcp', subject: 'service:mcp' } as const
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
            serviceId: v.string(),
            subject: v.string(),
          }),
          resolve: async (_ctx, args) =>
            (args as { principal?: typeof principal }).principal ?? principal,
        }),
        trustedForwardingKey: 'explicit-component-boundary-key',
      },
    )

    const registered = bridge.internalMutation({
      component: 'component.mutation' as never,
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
            runMutation: (component: string, args: unknown) => Promise<unknown>
          },
          args: { slug: string },
        ) => Promise<unknown>
      }
    }

    const runMutation = vi.fn(async () => ({ ok: true }))
    const customized = await registered.customization.input({ runMutation }, { principal })

    await registered.definition.handler(
      {
        ...customized.ctx,
        runMutation,
      },
      { slug: 'docs' },
    )

    expect(runMutation).toHaveBeenCalledWith('component.mutation', {
      slug: 'docs',
      _trustedForwardingKey: 'explicit-component-boundary-key',
      _trustedForwarding: {
        principalSubject: 'service:mcp',
      },
      principal,
    })
  })

  it('rejects weak trusted forwarding keys in production', async () => {
    process.env.NODE_ENV = 'production'
    process.env.CONVEX_TRUSTED_FORWARDING_KEY = 'bridge-secret'
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
            serviceId: v.string(),
            subject: v.string(),
          }),
          resolve: async (_ctx, args) =>
            (args as { principal?: { kind: 'service'; serviceId: string; subject: string } })
              .principal!,
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
        ) => Promise<{ ctx: { principal: () => Promise<unknown> } }>
      }
      definition: {
        handler: (
          ctx: {
            principal: () => Promise<unknown>
            runQuery: (component: string, args: unknown) => Promise<unknown>
          },
          args: { slug: string },
        ) => Promise<unknown>
      }
    }

    const customized = await registered.customization.input(
      { runQuery: vi.fn() },
      { principal: { kind: 'service', serviceId: 'mcp', subject: 'service:mcp' } },
    )

    await expect(
      registered.definition.handler(
        {
          ...customized.ctx,
          runQuery: vi.fn(),
        },
        { slug: 'docs' },
      ),
    ).rejects.toThrow(/at least 32 characters/i)
  })

  it('rejects non-canonical forwarded principal subjects on internal bridge paths', async () => {
    process.env.CONVEX_TRUSTED_FORWARDING_KEY = 'bridge-secret'
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
            serviceId: v.string(),
            subject: v.string(),
          }),
          resolve: async (_ctx, args) =>
            (
              args as {
                principal?: { kind: 'service'; serviceId: string; subject: string }
              }
            ).principal!,
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
        ) => Promise<{ ctx: { principal: () => Promise<unknown> } }>
      }
      definition: {
        handler: (
          ctx: {
            principal: () => Promise<unknown>
            runQuery: (component: string, args: unknown) => Promise<unknown>
          },
          args: { slug: string },
        ) => Promise<unknown>
      }
    }

    const customized = await registered.customization.input(
      { runQuery: vi.fn() },
      { principal: { kind: 'service', serviceId: 'mcp', subject: 'not-a-subject' } },
    )

    await expect(
      registered.definition.handler(
        {
          ...customized.ctx,
          runQuery: vi.fn(),
        },
        { slug: 'docs' },
      ),
    ).rejects.toThrow(/canonical subject/)
  })
})
