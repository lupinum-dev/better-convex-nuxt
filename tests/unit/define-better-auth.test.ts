import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const defineBetterAuthMocks = vi.hoisted(() => ({
  betterAuthMock: vi.fn(() => ({ kind: 'better-auth-instance' })),
  convexPluginMock: vi.fn(() => ({ kind: 'convex-plugin' })),
  createClientMock: vi.fn(),
}))

vi.mock('@convex-dev/better-auth', () => ({
  createClient: defineBetterAuthMocks.createClientMock,
}))

vi.mock('@convex-dev/better-auth/plugins', () => ({
  convex: defineBetterAuthMocks.convexPluginMock,
}))

vi.mock('better-auth', () => ({
  betterAuth: defineBetterAuthMocks.betterAuthMock,
}))

let defineBetterAuth: typeof import('../../src/runtime/auth/define-better-auth').defineBetterAuth

function createDefineBetterAuthDeps() {
  return {
    components: { betterAuth: {} },
    internal: { auth: {} },
    mutation: vi.fn((definition) => definition),
    authConfig: {},
  }
}

function createQueryBuilder(result: unknown) {
  return {
    withIndex: vi.fn((_indexName, buildQuery) => {
      buildQuery?.({ eq: vi.fn(() => ({})) })
      return {
        first: vi.fn(async () => result),
      }
    }),
  }
}

function createIdentity(overrides: Record<string, unknown> = {}) {
  return {
    subject: 'better-auth-user',
    tokenIdentifier: 'issuer|better-auth-user',
    email: 'auth@test.com',
    name: 'Auth User',
    ...overrides,
  }
}

describe('defineBetterAuth', () => {
  beforeAll(async () => {
    ;({ defineBetterAuth } = await import('../../src/runtime/auth/define-better-auth'))
  })

  beforeEach(() => {
    vi.clearAllMocks()
    defineBetterAuthMocks.betterAuthMock.mockImplementation((options) => ({
      kind: 'better-auth-instance',
      options,
    }))
    defineBetterAuthMocks.createClientMock.mockImplementation(() => ({
      adapter: vi.fn(() => ({ kind: 'adapter' })),
    }))
    defineBetterAuthMocks.convexPluginMock.mockReturnValue({ kind: 'convex-plugin' })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('configures Better Auth without app-user component triggers', () => {
    const deps = createDefineBetterAuthDeps()
    defineBetterAuth(deps)

    expect(defineBetterAuthMocks.createClientMock).toHaveBeenCalledWith(deps.components.betterAuth)
  })

  it('rejects reserved module-owned user fields', async () => {
    const deps = createDefineBetterAuthDeps()
    const { createUserIfNeeded } = defineBetterAuth(deps, {
      userFields: () => ({
        authKey: 'override',
      }),
    })

    const insert = vi.fn()
    const ctx = {
      auth: {
        getUserIdentity: vi.fn(async () => createIdentity()),
      },
      db: {
        query: vi.fn(() => createQueryBuilder(null)),
        insert,
      },
    }

    await expect(createUserIfNeeded.handler(ctx)).rejects.toThrow(
      'defineBetterAuth.userFields must not define reserved key "authKey".',
    )
    expect(insert).not.toHaveBeenCalled()
  })

  it('inserts a Trellis user from Convex tokenIdentifier', async () => {
    const deps = createDefineBetterAuthDeps()
    const onUserCreated = vi.fn()
    const { createUserIfNeeded } = defineBetterAuth(deps, {
      onUserCreated,
      userFields: ({ authKey }) => ({ role: authKey.includes('owner') ? 'owner' : 'member' }),
    })

    const insert = vi.fn(async () => 'new_user_id')
    const ctx = {
      auth: {
        getUserIdentity: vi.fn(async () =>
          createIdentity({
            tokenIdentifier: 'issuer|owner',
            subject: 'better-auth-component-user-id',
            image: 'https://example.test/avatar.png',
          }),
        ),
      },
      db: {
        query: vi.fn(() => createQueryBuilder(null)),
        insert,
      },
    }

    await expect(createUserIfNeeded.handler(ctx)).resolves.toBe('new_user_id')
    expect(insert).toHaveBeenCalledWith(
      'users',
      expect.objectContaining({
        authKey: 'issuer|owner',
        email: 'auth@test.com',
        displayName: 'Auth User',
        avatarUrl: 'https://example.test/avatar.png',
        role: 'owner',
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number),
      }),
    )
    expect(onUserCreated).toHaveBeenCalledWith(ctx, 'new_user_id')
  })

  it('patches the existing Trellis user in createUserIfNeeded', async () => {
    const deps = createDefineBetterAuthDeps()
    const onUserUpdated = vi.fn()
    const { createUserIfNeeded } = defineBetterAuth(deps, { onUserUpdated })

    const insert = vi.fn()
    const patch = vi.fn()
    const ctx = {
      auth: {
        getUserIdentity: vi.fn(async () => createIdentity({ name: 'Updated Name' })),
      },
      db: {
        query: vi.fn(() => createQueryBuilder({ _id: 'user_existing', authKey: 'issuer|user' })),
        insert,
        patch,
      },
    }

    await expect(createUserIfNeeded.handler(ctx)).resolves.toBe('user_existing')
    expect(insert).not.toHaveBeenCalled()
    expect(patch).toHaveBeenCalledWith(
      'user_existing',
      expect.objectContaining({
        email: 'auth@test.com',
        displayName: 'Updated Name',
        updatedAt: expect.any(Number),
      }),
    )
    expect(onUserUpdated).toHaveBeenCalledWith(ctx, 'user_existing')
  })

  it('requires Convex tokenIdentifier for bootstrap', async () => {
    const deps = createDefineBetterAuthDeps()
    const { createUserIfNeeded } = defineBetterAuth(deps)

    const ctx = {
      auth: {
        getUserIdentity: vi.fn(async () => ({ subject: 'better-auth-user' })),
      },
      db: {
        query: vi.fn(() => createQueryBuilder(null)),
      },
    }

    await expect(createUserIfNeeded.handler(ctx)).rejects.toThrow(/tokenIdentifier/)
  })

  it('trusts both localhost and 127.0.0.1 for the same local dev port', async () => {
    const deps = createDefineBetterAuthDeps()
    const custom = vi.fn(() => ({ kind: 'custom-auth' }))
    vi.stubEnv('SITE_URL', 'http://127.0.0.1:4122')

    const { createAuth } = defineBetterAuth(deps, { custom })
    createAuth({})

    expect(custom).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        siteUrl: 'http://127.0.0.1:4122',
        trustedOrigins: expect.arrayContaining(['http://127.0.0.1:4122', 'http://localhost:4122']),
      }),
    )
  })

  it('does not trust localhost loopback origins for a production site url', async () => {
    const deps = createDefineBetterAuthDeps()
    const custom = vi.fn(() => ({ kind: 'custom-auth' }))
    vi.stubEnv('SITE_URL', 'https://app.example.com')

    const { createAuth } = defineBetterAuth(deps, { custom })
    createAuth({})

    expect(custom).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        siteUrl: 'https://app.example.com',
        trustedOrigins: ['https://app.example.com'],
      }),
    )
  })

  it('lets custom auth compose auth-side Better Auth plugins with the Convex bridge', async () => {
    const deps = createDefineBetterAuthDeps()
    const { getAuthConfigProvider } = await import('@convex-dev/better-auth/auth-config')
    deps.authConfig = {
      providers: [getAuthConfigProvider()],
    }
    const custom = vi.fn((_ctx, bridge) => ({
      plugins: [bridge.createConvexPlugin({ foo: 'bar' }), { kind: 'admin-plugin' }],
      trustedOrigins: bridge.trustedOrigins,
    }))

    const { createAuth } = defineBetterAuth(deps, { custom })
    const result = createAuth({})

    expect(custom).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        siteUrl: 'http://localhost:3000',
        database: expect.anything(),
        trustedOrigins: expect.any(Array),
        createConvexPlugin: expect.any(Function),
      }),
    )
    expect(result.trustedOrigins).toEqual(['http://localhost:3000', 'http://127.0.0.1:3000'])
    expect(result.plugins).toHaveLength(2)
    expect(result.plugins?.[1]).toEqual({ kind: 'admin-plugin' })
  })

  it('passes static JWKS to the Convex plugin when configured', async () => {
    const deps = createDefineBetterAuthDeps()
    vi.stubEnv(
      'JWKS',
      '[{"id":"key-1","publicKey":"{\\"kty\\":\\"RSA\\"}","privateKey":"\\"secret\\"","createdAt":1}]',
    )

    const { getAuthConfigProvider } = await import('@convex-dev/better-auth/auth-config')
    deps.authConfig = {
      providers: [getAuthConfigProvider({ jwks: process.env.JWKS })],
    }

    expect(() => defineBetterAuth(deps).createAuth({})).not.toThrow()
  })

  it('does not force a Better Auth rate-limit storage backend by default', async () => {
    const deps = createDefineBetterAuthDeps()
    const { getAuthConfigProvider } = await import('@convex-dev/better-auth/auth-config')
    deps.authConfig = {
      providers: [getAuthConfigProvider()],
    }

    const auth = defineBetterAuth(deps).createAuth({}) as {
      options?: { rateLimit?: { storage?: string } }
    }

    expect(auth.options?.rateLimit).toBeUndefined()
  })

  it('passes through an explicit memory rate-limit override', async () => {
    const deps = createDefineBetterAuthDeps()
    const { getAuthConfigProvider } = await import('@convex-dev/better-auth/auth-config')
    deps.authConfig = {
      providers: [getAuthConfigProvider()],
    }
    const auth = defineBetterAuth(deps, {
      rateLimit: { storage: 'memory' },
    }).createAuth({}) as { options?: { rateLimit?: { storage?: string } } }

    expect(auth.options?.rateLimit?.storage).toBe('memory')
  })

  it('passes through an explicit database rate-limit override', async () => {
    const deps = createDefineBetterAuthDeps()
    const { getAuthConfigProvider } = await import('@convex-dev/better-auth/auth-config')
    deps.authConfig = {
      providers: [getAuthConfigProvider()],
    }
    const auth = defineBetterAuth(deps, {
      rateLimit: { storage: 'database' },
    }).createAuth({}) as { options?: { rateLimit?: { storage?: string } } }

    expect(auth.options?.rateLimit?.storage).toBe('database')
  })
})
