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
    caller: Record<string, unknown>
  },
) {
  const { verifyIdentityForwardingEnvelope } = await import('../../src/runtime/identity-forwarding')
  expect(args).toMatchObject({
    ...options.appArgs,
    _trellisForwarding: expect.any(String),
  })
  expect(args).not.toHaveProperty('_trellisForwardingKey')
  expect(args).not.toHaveProperty('_identityForwardingKey')
  expect(args).not.toHaveProperty('_identityForwarding')
  expect(args).not.toHaveProperty('caller')

  const envelope = (args as { _trellisForwarding: string })._trellisForwarding
  const payload = verifyIdentityForwardingEnvelope(envelope, {
    keys: { default: options.key },
    expectedIssuer: bridgeIssuer,
    expectedAudience: bridgeAudience,
    expectedPurpose: options.purpose,
    expectedTransport: 'bridge',
    functionRef: options.functionRef,
    args: options.appArgs,
  })
  expect(payload.caller).toEqual(options.caller)
  expect(() =>
    verifyIdentityForwardingEnvelope(envelope, {
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
    verifyIdentityForwardingEnvelope(envelope, {
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
    delete process.env.CONVEX_IDENTITY_FORWARDING_KEY
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = originalNodeEnv
    }
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('forwards the resolved caller unchanged for internal query bridges', async () => {
    process.env.CONVEX_IDENTITY_FORWARDING_KEY = 'bridge-secret'
    const { createComponentBridge } = await import('../../packages/trellis-bridge/src/component')
    const { defineCaller } = await import('../../src/runtime/functions')

    const caller = { kind: 'service', serviceId: 'mcp', subject: 'service:mcp' } as const
    const bridge = createComponentBridge(
      {
        query: (() => null as never) as never,
        mutation: (() => null as never) as never,
        internalQuery: (() => null as never) as never,
        internalMutation: (() => null as never) as never,
      },
      {
        caller: defineCaller({
          validator: v.object({
            kind: v.literal('service'),
            serviceId: v.string(),
            subject: v.string(),
          }),
          resolve: async (_ctx, args) => (args as { caller?: typeof caller }).caller ?? caller,
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
        ) => Promise<{ ctx: { caller: () => Promise<typeof caller> } }>
      }
      definition: {
        handler: (
          ctx: {
            caller: () => Promise<typeof caller>
            runQuery: (component: string, args: unknown) => Promise<unknown>
          },
          args: { slug: string },
        ) => Promise<unknown>
      }
    }

    const runQuery = vi.fn(async () => ({ ok: true }))
    const customized = await registered.customization.input({ runQuery }, { caller })

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
    })
    await expectSignedBridgeArgs(runQuery.mock.calls[0]![1], {
      key: 'bridge-secret',
      purpose: 'query',
      functionRef: 'component.query',
      appArgs: { slug: 'docs' },
      caller,
    })
  })

  it('rejects bridge envelopes signed for a different component function', async () => {
    process.env.CONVEX_IDENTITY_FORWARDING_KEY = 'bridge-secret'
    const { createComponentBridge, createBridgeForwardingArgs } =
      await import('../../packages/trellis-bridge/src/component')
    const { defineCaller } = await import('../../src/runtime/functions')
    const { getForwardedCaller } = await import('../../src/runtime/identity-forwarding')

    const caller = { kind: 'service', serviceId: 'mcp', subject: 'service:mcp' } as const
    const bridge = createComponentBridge(
      {
        query: (() => null as never) as never,
        mutation: (() => null as never) as never,
        internalQuery: (() => null as never) as never,
        internalMutation: (() => null as never) as never,
      },
      {
        caller: defineCaller({
          validator: v.object({
            kind: v.literal('service'),
            serviceId: v.string(),
            subject: v.string(),
          }),
          resolve: async (ctx, args) =>
            getForwardedCaller<typeof caller>(ctx as never, args as never) ?? caller,
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
        ) => Promise<{ ctx: { caller: () => Promise<typeof caller> } }>
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
        ) => Promise<{ ctx: { caller: () => Promise<typeof caller> } }>
      }
    }

    const signedForA = createBridgeForwardingArgs(
      { slug: 'docs' },
      caller,
      'bridge-secret',
      'query',
      'component.a' as never,
    )

    const customizedA = await bridgeA.customization.input({}, signedForA)
    await expect(customizedA.ctx.caller()).resolves.toEqual(caller)

    const customizedB = await bridgeB.customization.input({}, signedForA)
    await expect(customizedB.ctx.caller()).rejects.toThrow(/function-ref/i)
  })

  it('forwards the resolved caller unchanged for internal action bridges', async () => {
    process.env.CONVEX_IDENTITY_FORWARDING_KEY = 'bridge-secret'
    const { createComponentBridge } = await import('../../packages/trellis-bridge/src/component')
    const { defineCaller } = await import('../../src/runtime/functions')

    const caller = { kind: 'service', serviceId: 'mcp', subject: 'service:mcp' } as const
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
        caller: defineCaller({
          validator: v.object({
            kind: v.literal('service'),
            serviceId: v.string(),
            subject: v.string(),
          }),
          resolve: async (_ctx, args) => (args as { caller?: typeof caller }).caller ?? caller,
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
        ) => Promise<{ ctx: { caller: () => Promise<typeof caller> } }>
      }
      definition: {
        handler: (
          ctx: {
            caller: () => Promise<typeof caller>
            runAction: (component: string, args: unknown) => Promise<unknown>
          },
          args: { slug: string },
        ) => Promise<unknown>
      }
    }

    const runAction = vi.fn(async () => ({ ok: true }))
    const customized = await registered.customization.input({ runAction }, { caller })

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
    })
    await expectSignedBridgeArgs(runAction.mock.calls[0]![1], {
      key: 'bridge-secret',
      purpose: 'action',
      functionRef: 'component.action',
      appArgs: { slug: 'docs' },
      caller,
    })
  })

  it('rejects caller-supplied caller on public query bridges', async () => {
    process.env.CONVEX_IDENTITY_FORWARDING_KEY = 'bridge-secret'
    const { createComponentBridge } = await import('../../packages/trellis-bridge/src/component')
    const { defineCaller } = await import('../../src/runtime/functions')
    const { getForwardedCaller } = await import('../../src/runtime/identity-forwarding')

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
    const resolveCaller = vi.fn(async (ctx, args) => {
      return (
        getForwardedCaller<typeof trustedPrincipal>(ctx as never, args as never) ?? trustedPrincipal
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
        caller: defineCaller({
          validator: v.object({
            kind: v.literal('service'),
            serviceId: v.string(),
            subject: v.string(),
          }),
          resolve: resolveCaller,
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
        ) => Promise<{ ctx: { caller: () => Promise<typeof trustedPrincipal> } }>
      }
    }

    expect(registered.customization.args).toEqual({})

    const customized = await registered.customization.input(
      { runQuery: vi.fn() },
      {
        caller: attackerPrincipal,
      },
    )

    await expect(customized.ctx.caller()).rejects.toThrow(
      /Forwarded `caller` is only allowed on verified identity forwarding paths/,
    )
    expect(resolveCaller).toHaveBeenCalled()
  })

  it('forwards the resolved caller unchanged when bridge entries are declared in batch', async () => {
    process.env.CONVEX_IDENTITY_FORWARDING_KEY = 'bridge-secret'
    const { createComponentBridge } = await import('../../packages/trellis-bridge/src/component')
    const { defineCaller } = await import('../../src/runtime/functions')

    const caller = { kind: 'service', serviceId: 'mcp', subject: 'service:mcp' } as const
    const bridge = createComponentBridge(
      {
        query: (() => null as never) as never,
        mutation: (() => null as never) as never,
        internalQuery: (() => null as never) as never,
        internalMutation: (() => null as never) as never,
      },
      {
        caller: defineCaller({
          validator: v.object({
            kind: v.literal('service'),
            serviceId: v.string(),
            subject: v.string(),
          }),
          resolve: async (_ctx, args) => (args as { caller?: typeof caller }).caller ?? caller,
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
        ) => Promise<{ ctx: { caller: () => Promise<typeof caller> } }>
      }
      definition: {
        handler: (
          ctx: {
            caller: () => Promise<typeof caller>
            runQuery: (component: string, args: unknown) => Promise<unknown>
          },
          args: { slug: string },
        ) => Promise<unknown>
      }
    }

    const runQuery = vi.fn(async () => ({ ok: true }))
    const customized = await registered.customization.input({ runQuery }, { caller })

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
    })
    await expectSignedBridgeArgs(runQuery.mock.calls[0]![1], {
      key: 'bridge-secret',
      purpose: 'query',
      functionRef: 'component.query',
      appArgs: { slug: 'docs' },
      caller,
    })
  })

  it('keeps anonymous public bridge calls unsigned without requiring a forwarding key', async () => {
    const { createComponentBridge } = await import('../../packages/trellis-bridge/src/component')
    const { defineCaller } = await import('../../src/runtime/functions')

    const caller = { kind: 'anonymous' } as const
    const bridge = createComponentBridge(
      {
        query: (() => null as never) as never,
        mutation: (() => null as never) as never,
        internalQuery: (() => null as never) as never,
        internalMutation: (() => null as never) as never,
      },
      {
        caller: defineCaller({
          validator: v.object({ kind: v.literal('anonymous') }),
          resolve: async () => caller,
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
        ) => Promise<{ ctx: { caller: () => Promise<typeof caller> } }>
      }
      definition: {
        handler: (
          ctx: {
            caller: () => Promise<typeof caller>
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

  it('fails closed when no identity forwarding key is configured', async () => {
    const { createComponentBridge } = await import('../../packages/trellis-bridge/src/component')
    const { defineCaller } = await import('../../src/runtime/functions')

    const bridge = createComponentBridge(
      {
        query: (() => null as never) as never,
        mutation: (() => null as never) as never,
        internalQuery: (() => null as never) as never,
        internalMutation: (() => null as never) as never,
      },
      {
        caller: defineCaller({
          validator: v.object({
            kind: v.literal('service'),
            serviceId: v.string(),
            subject: v.string(),
          }),
          resolve: async (_ctx, args) =>
            (args as { caller?: { kind: 'service'; serviceId: string; subject: string } }).caller!,
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
              { caller: { kind: 'service', serviceId: 'mcp', subject: 'service:mcp' } },
            )
          ).ctx,
          runQuery: vi.fn(),
        },
        { slug: 'docs' },
      ),
    ).rejects.toThrow(/CONVEX_IDENTITY_FORWARDING_KEY/)
  })

  it('fails closed at component verification when the component side has no key', async () => {
    const { createBridgeForwardingArgs, createComponentBridge } =
      await import('../../packages/trellis-bridge/src/component')
    const { defineCaller } = await import('../../src/runtime/functions')
    const { getForwardedCaller } = await import('../../src/runtime/identity-forwarding')

    const caller = { kind: 'service', serviceId: 'mcp', subject: 'service:mcp' } as const
    const signedArgs = createBridgeForwardingArgs(
      { slug: 'docs' },
      caller,
      'explicit-component-boundary-key',
      'query',
      'component.query' as never,
    )

    const bridge = createComponentBridge(
      {
        query: (() => null as never) as never,
        mutation: (() => null as never) as never,
        internalQuery: (() => null as never) as never,
        internalMutation: (() => null as never) as never,
      },
      {
        caller: defineCaller({
          validator: v.object({
            kind: v.literal('service'),
            serviceId: v.string(),
            subject: v.string(),
          }),
          resolve: async (ctx, args) =>
            getForwardedCaller<typeof caller>(ctx as never, args as never) ?? caller,
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
        ) => Promise<{ ctx: { caller: () => Promise<typeof caller> } }>
      }
    }

    const customized = await registered.customization.input({}, signedArgs)
    await expect(customized.ctx.caller()).rejects.toThrow(/CONVEX_IDENTITY_FORWARDING_KEY/)
  })

  it('uses an explicit identity forwarding key without reading process env', async () => {
    const { createComponentBridge } = await import('../../packages/trellis-bridge/src/component')
    const { defineCaller } = await import('../../src/runtime/functions')

    const caller = { kind: 'service', serviceId: 'mcp', subject: 'service:mcp' } as const
    const bridge = createComponentBridge(
      {
        query: (() => null as never) as never,
        mutation: (() => null as never) as never,
        internalQuery: (() => null as never) as never,
        internalMutation: (() => null as never) as never,
      },
      {
        caller: defineCaller({
          validator: v.object({
            kind: v.literal('service'),
            serviceId: v.string(),
            subject: v.string(),
          }),
          resolve: async (_ctx, args) => (args as { caller?: typeof caller }).caller ?? caller,
        }),
        identityForwardingKey: 'explicit-component-boundary-key',
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
        ) => Promise<{ ctx: { caller: () => Promise<typeof caller> } }>
      }
      definition: {
        handler: (
          ctx: {
            caller: () => Promise<typeof caller>
            runMutation: (component: string, args: unknown) => Promise<unknown>
          },
          args: { slug: string },
        ) => Promise<unknown>
      }
    }

    const runMutation = vi.fn(async () => ({ ok: true }))
    const customized = await registered.customization.input({ runMutation }, { caller })

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
    })
    await expectSignedBridgeArgs(runMutation.mock.calls[0]![1], {
      key: 'explicit-component-boundary-key',
      purpose: 'mutation',
      functionRef: 'component.mutation',
      appArgs: { slug: 'docs' },
      caller,
    })
  })

  it('passes bridge call args into identity forwarding key callbacks before signing', async () => {
    const { createComponentBridge } = await import('../../packages/trellis-bridge/src/component')
    const { defineCaller } = await import('../../src/runtime/functions')

    const caller = { kind: 'service', serviceId: 'mcp', subject: 'service:mcp' } as const
    const identityForwardingKey = vi.fn((args?: unknown) => {
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
        caller: defineCaller({
          validator: v.object({
            kind: v.literal('service'),
            serviceId: v.string(),
            subject: v.string(),
          }),
          resolve: async () => caller,
        }),
        identityForwardingKey,
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
        ) => Promise<{ ctx: { caller: () => Promise<typeof caller> } }>
      }
      definition: {
        handler: (
          ctx: {
            caller: () => Promise<typeof caller>
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

    expect(identityForwardingKey).toHaveBeenCalledTimes(1)
    expect(runMutation).toHaveBeenCalledWith('component.mutation', {
      slug: 'docs',
      _trellisForwarding: expect.any(String),
    })
    await expectSignedBridgeArgs(runMutation.mock.calls[0]![1], {
      key: 'args-aware-component-boundary-key',
      purpose: 'mutation',
      functionRef: 'component.mutation',
      appArgs: { slug: 'docs' },
      caller,
    })
  })

  it('rejects weak identity forwarding keys in production', async () => {
    process.env.NODE_ENV = 'production'
    process.env.CONVEX_IDENTITY_FORWARDING_KEY = 'bridge-secret'
    const { createComponentBridge } = await import('../../packages/trellis-bridge/src/component')
    const { defineCaller } = await import('../../src/runtime/functions')

    const bridge = createComponentBridge(
      {
        query: (() => null as never) as never,
        mutation: (() => null as never) as never,
        internalQuery: (() => null as never) as never,
        internalMutation: (() => null as never) as never,
      },
      {
        caller: defineCaller({
          validator: v.object({
            kind: v.literal('service'),
            serviceId: v.string(),
            subject: v.string(),
          }),
          resolve: async (_ctx, args) =>
            (args as { caller?: { kind: 'service'; serviceId: string; subject: string } }).caller!,
        }),
      },
    )

    const registered = bridge.internalQuery({
      component: 'component.query' as never,
      args: { slug: v.string() },
    }) as {
      customization: {
        input: (ctx: unknown, args: unknown) => Promise<{ ctx: { caller: () => Promise<unknown> } }>
      }
      definition: {
        handler: (
          ctx: {
            caller: () => Promise<unknown>
            runQuery: (component: string, args: unknown) => Promise<unknown>
          },
          args: { slug: string },
        ) => Promise<unknown>
      }
    }

    const customized = await registered.customization.input(
      { runQuery: vi.fn() },
      { caller: { kind: 'service', serviceId: 'mcp', subject: 'service:mcp' } },
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

  it('rejects non-canonical forwarded caller subjects on internal bridge paths', async () => {
    process.env.CONVEX_IDENTITY_FORWARDING_KEY = 'bridge-secret'
    const { createComponentBridge } = await import('../../packages/trellis-bridge/src/component')
    const { defineCaller } = await import('../../src/runtime/functions')

    const bridge = createComponentBridge(
      {
        query: (() => null as never) as never,
        mutation: (() => null as never) as never,
        internalQuery: (() => null as never) as never,
        internalMutation: (() => null as never) as never,
      },
      {
        caller: defineCaller({
          validator: v.object({
            kind: v.literal('service'),
            serviceId: v.string(),
            subject: v.string(),
          }),
          resolve: async (_ctx, args) =>
            (
              args as {
                caller?: { kind: 'service'; serviceId: string; subject: string }
              }
            ).caller!,
        }),
      },
    )

    const registered = bridge.internalQuery({
      component: 'component.query' as never,
      args: { slug: v.string() },
    }) as {
      customization: {
        input: (ctx: unknown, args: unknown) => Promise<{ ctx: { caller: () => Promise<unknown> } }>
      }
      definition: {
        handler: (
          ctx: {
            caller: () => Promise<unknown>
            runQuery: (component: string, args: unknown) => Promise<unknown>
          },
          args: { slug: string },
        ) => Promise<unknown>
      }
    }

    const customized = await registered.customization.input(
      { runQuery: vi.fn() },
      { caller: { kind: 'service', serviceId: 'mcp', subject: 'not-a-subject' } },
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
