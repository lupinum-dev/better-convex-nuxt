import { v } from 'convex/values'
import { afterEach, describe, expect, it, vi } from 'vitest'

const originalNodeEnv = process.env.NODE_ENV
const bridgeIssuer = 'trellis://server'
const bridgeAudience = 'trellis://convex'

async function expectSignedBridgeArgs(
  args: unknown,
  options: {
    key: string
    purpose: 'query' | 'mutation' | 'action'
    functionRef: string
    appArgs: Record<string, unknown>
    principal: Record<string, unknown>
  },
) {
  const { verifyTrustedForwardingEnvelope } = await import('../../src/runtime/trusted-forwarding')
  expect(args).toMatchObject({
    ...options.appArgs,
    _trellisForwarding: expect.any(String),
    _trellisForwardingKey: options.key,
  })
  expect(args).not.toHaveProperty('_trustedForwardingKey')
  expect(args).not.toHaveProperty('_trustedForwarding')
  expect(args).not.toHaveProperty('principal')

  const envelope = (args as { _trellisForwarding: string })._trellisForwarding
  const payload = verifyTrustedForwardingEnvelope(envelope, {
    keys: { default: options.key },
    expectedIssuer: bridgeIssuer,
    expectedAudience: bridgeAudience,
    expectedPurpose: options.purpose,
    expectedTransport: 'bridge',
    functionRef: options.functionRef,
    args: options.appArgs,
  })
  expect(payload.principal).toEqual(options.principal)
  expect(() =>
    verifyTrustedForwardingEnvelope(envelope, {
      keys: { default: options.key },
      expectedIssuer: bridgeIssuer,
      expectedAudience: bridgeAudience,
      expectedPurpose: options.purpose,
      expectedTransport: 'bridge',
      functionRef: `${options.functionRef}.wrong`,
      args: options.appArgs,
    }),
  ).toThrow(/function ref/)
  expect(() =>
    verifyTrustedForwardingEnvelope(envelope, {
      keys: { default: options.key },
      expectedIssuer: bridgeIssuer,
      expectedAudience: bridgeAudience,
      expectedPurpose: options.purpose === 'query' ? 'mutation' : 'query',
      expectedTransport: 'bridge',
      functionRef: options.functionRef,
      args: options.appArgs,
    }),
  ).toThrow(/purpose/)
}

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
    const { createComponentBridge } = await import('../../packages/trellis-bridge/src/component')
    const { definePrincipal } = await import('../../src/runtime/functions')

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
      _trellisForwarding: expect.any(String),
      _trellisForwardingKey: 'bridge-secret',
    })
    await expectSignedBridgeArgs(runQuery.mock.calls[0]![1], {
      key: 'bridge-secret',
      purpose: 'query',
      functionRef: 'component.query',
      appArgs: { slug: 'docs' },
      principal,
    })
  })

  it('rejects bridge envelopes signed for a different component function', async () => {
    process.env.CONVEX_TRUSTED_FORWARDING_KEY = 'bridge-secret'
    const { createComponentBridge, createBridgeForwardingArgs } = await import(
      '../../packages/trellis-bridge/src/component'
    )
    const { definePrincipal } = await import('../../src/runtime/functions')
    const { getForwardedPrincipal } = await import('../../src/runtime/trusted-forwarding')

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
          resolve: async (ctx, args) =>
            getForwardedPrincipal<typeof principal>(ctx as never, args as never) ?? principal,
        }),
      },
    )

    const bridgeA = bridge.internalQuery({
      component: 'component.a' as never,
      args: { slug: v.string() },
    }) as {
      customization: {
        input: (
          ctx: unknown,
          args: unknown,
        ) => Promise<{ ctx: { principal: () => Promise<typeof principal> } }>
      }
    }
    const bridgeB = bridge.internalQuery({
      component: 'component.b' as never,
      args: { slug: v.string() },
    }) as {
      customization: {
        input: (
          ctx: unknown,
          args: unknown,
        ) => Promise<{ ctx: { principal: () => Promise<typeof principal> } }>
      }
    }

    const signedForA = createBridgeForwardingArgs(
      { slug: 'docs' },
      principal,
      'bridge-secret',
      'query',
      'component.a' as never,
    )

    const customizedA = await bridgeA.customization.input({}, signedForA)
    await expect(customizedA.ctx.principal()).resolves.toEqual(principal)

    const customizedB = await bridgeB.customization.input({}, signedForA)
    await expect(customizedB.ctx.principal()).rejects.toThrow(/function-ref/i)
  })

  it('forwards the resolved principal unchanged for internal action bridges', async () => {
    process.env.CONVEX_TRUSTED_FORWARDING_KEY = 'bridge-secret'
    const { createComponentBridge } = await import('../../packages/trellis-bridge/src/component')
    const { definePrincipal } = await import('../../src/runtime/functions')

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
      _trellisForwarding: expect.any(String),
      _trellisForwardingKey: 'bridge-secret',
    })
    await expectSignedBridgeArgs(runAction.mock.calls[0]![1], {
      key: 'bridge-secret',
      purpose: 'action',
      functionRef: 'component.action',
      appArgs: { slug: 'docs' },
      principal,
    })
  })

  it('rejects caller-supplied principal on public query bridges', async () => {
    process.env.CONVEX_TRUSTED_FORWARDING_KEY = 'bridge-secret'
    const { createComponentBridge } = await import('../../packages/trellis-bridge/src/component')
    const { definePrincipal } = await import('../../src/runtime/functions')
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
    const { createComponentBridge } = await import('../../packages/trellis-bridge/src/component')
    const { definePrincipal } = await import('../../src/runtime/functions')

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
      _trellisForwarding: expect.any(String),
      _trellisForwardingKey: 'bridge-secret',
    })
    await expectSignedBridgeArgs(runQuery.mock.calls[0]![1], {
      key: 'bridge-secret',
      purpose: 'query',
      functionRef: 'component.query',
      appArgs: { slug: 'docs' },
      principal,
    })
  })

  it('keeps anonymous public bridge calls unsigned without requiring a forwarding key', async () => {
    const { createComponentBridge } = await import('../../packages/trellis-bridge/src/component')
    const { definePrincipal } = await import('../../src/runtime/functions')

    const principal = { kind: 'anonymous' } as const
    const bridge = createComponentBridge(
      {
        query: (() => null as never) as never,
        mutation: (() => null as never) as never,
        internalQuery: (() => null as never) as never,
        internalMutation: (() => null as never) as never,
      },
      {
        principal: definePrincipal({
          validator: v.object({ kind: v.literal('anonymous') }),
          resolve: async () => principal,
        }),
      },
    )

    const registered = bridge.query({
      component: 'component.publicQuery' as never,
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
    const customized = await registered.customization.input({ runQuery }, {})

    await registered.definition.handler(
      {
        ...customized.ctx,
        runQuery,
      },
      { slug: 'docs' },
    )

    expect(runQuery).toHaveBeenCalledWith('component.publicQuery', { slug: 'docs' })
  })

  it('fails closed when no trusted forwarding key is configured', async () => {
    const { createComponentBridge } = await import('../../packages/trellis-bridge/src/component')
    const { definePrincipal } = await import('../../src/runtime/functions')

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
    const { createComponentBridge } = await import('../../packages/trellis-bridge/src/component')
    const { definePrincipal } = await import('../../src/runtime/functions')

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
      _trellisForwarding: expect.any(String),
      _trellisForwardingKey: 'explicit-component-boundary-key',
    })
    await expectSignedBridgeArgs(runMutation.mock.calls[0]![1], {
      key: 'explicit-component-boundary-key',
      purpose: 'mutation',
      functionRef: 'component.mutation',
      appArgs: { slug: 'docs' },
      principal,
    })
  })

  it('passes bridge call args into trusted forwarding key callbacks before signing', async () => {
    const { createComponentBridge } = await import('../../packages/trellis-bridge/src/component')
    const { definePrincipal } = await import('../../src/runtime/functions')

    const principal = { kind: 'service', serviceId: 'mcp', subject: 'service:mcp' } as const
    const trustedForwardingKey = vi.fn((args?: unknown) => {
      expect(args).toEqual({ slug: 'docs' })
      return 'args-aware-component-boundary-key'
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
          resolve: async () => principal,
        }),
        trustedForwardingKey,
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
    const customized = await registered.customization.input({ runMutation }, {})

    await registered.definition.handler(
      {
        ...customized.ctx,
        runMutation,
      },
      { slug: 'docs' },
    )

    expect(trustedForwardingKey).toHaveBeenCalledTimes(1)
    expect(runMutation).toHaveBeenCalledWith('component.mutation', {
      slug: 'docs',
      _trellisForwarding: expect.any(String),
      _trellisForwardingKey: 'args-aware-component-boundary-key',
    })
    await expectSignedBridgeArgs(runMutation.mock.calls[0]![1], {
      key: 'args-aware-component-boundary-key',
      purpose: 'mutation',
      functionRef: 'component.mutation',
      appArgs: { slug: 'docs' },
      principal,
    })
  })

  it('rejects weak trusted forwarding keys in production', async () => {
    process.env.NODE_ENV = 'production'
    process.env.CONVEX_TRUSTED_FORWARDING_KEY = 'bridge-secret'
    const { createComponentBridge } = await import('../../packages/trellis-bridge/src/component')
    const { definePrincipal } = await import('../../src/runtime/functions')

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
    const { createComponentBridge } = await import('../../packages/trellis-bridge/src/component')
    const { definePrincipal } = await import('../../src/runtime/functions')

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
