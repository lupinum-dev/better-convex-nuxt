import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const defineAuthMocks = vi.hoisted(() => ({
  betterAuthMock: vi.fn(() => ({ kind: 'better-auth-instance' })),
  convexPluginMock: vi.fn(() => ({ kind: 'convex-plugin' })),
  createClientMock: vi.fn(),
}))

vi.mock('@convex-dev/better-auth', () => ({
  createClient: defineAuthMocks.createClientMock,
}))

vi.mock('@convex-dev/better-auth/plugins', () => ({
  convex: defineAuthMocks.convexPluginMock,
}))

vi.mock('better-auth', () => ({
  betterAuth: defineAuthMocks.betterAuthMock,
}))

let defineAuth: typeof import('../../src/runtime/auth/define-auth').defineAuth

function createDefineAuthDeps() {
  return {
    components: { betterAuth: {} },
    internal: { auth: {} },
    mutation: vi.fn((definition) => definition),
    authConfig: {},
  }
}

function createQueryBuilder(result: unknown) {
  return {
    withIndex: vi.fn(() => ({
      first: vi.fn(async () => result),
    })),
  }
}

describe('defineAuth', () => {
  beforeAll(async () => {
    ;({ defineAuth } = await import('../../src/runtime/auth/define-auth'))
  })

  beforeEach(() => {
    vi.clearAllMocks()
    defineAuthMocks.betterAuthMock.mockImplementation((options) => ({
      kind: 'better-auth-instance',
      options,
    }))
    defineAuthMocks.createClientMock.mockImplementation((_component, options) => ({
      adapter: vi.fn(() => ({ kind: 'adapter' })),
      triggersApi: () => options.triggers.user,
    }))
    defineAuthMocks.convexPluginMock.mockReturnValue({ kind: 'convex-plugin' })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('rejects reserved module-owned user fields', async () => {
    const deps = createDefineAuthDeps()
    const { createUserIfNeeded } = defineAuth(deps, {
      userFields: () => ({
        authId: 'override',
      }),
    })

    const insert = vi.fn()
    const ctx = {
      auth: {
        getUserIdentity: vi.fn(async () => ({
          subject: 'auth-user',
          email: 'auth@test.com',
          name: 'Auth User',
        })),
      },
      db: {
        query: vi.fn(() => createQueryBuilder(null)),
        insert,
      },
    }

    await expect(createUserIfNeeded.handler(ctx)).rejects.toThrow(
      'defineAuth.userFields must not define reserved key "authId".',
    )
    expect(insert).not.toHaveBeenCalled()
  })

  it('does not insert a duplicate user row when the auth trigger sees an existing user', async () => {
    const deps = createDefineAuthDeps()
    const onUserCreated = vi.fn()
    const { authComponent } = defineAuth(deps, { onUserCreated })

    const insert = vi.fn()
    const ctx = {
      db: {
        query: vi.fn(() =>
          createQueryBuilder({
            _id: 'user_existing',
            authId: 'auth-user',
          }),
        ),
        insert,
      },
    }

    await authComponent.triggersApi().onCreate(ctx, {
      _id: 'auth-user',
      email: 'auth@test.com',
      name: 'Auth User',
    })

    expect(insert).not.toHaveBeenCalled()
    expect(onUserCreated).not.toHaveBeenCalled()
  })

  it('reuses the existing user id in createUserIfNeeded', async () => {
    const deps = createDefineAuthDeps()
    const { createUserIfNeeded } = defineAuth(deps)

    const insert = vi.fn()
    const ctx = {
      auth: {
        getUserIdentity: vi.fn(async () => ({
          subject: 'auth-user',
          email: 'auth@test.com',
          name: 'Auth User',
        })),
      },
      db: {
        query: vi.fn(() =>
          createQueryBuilder({
            _id: 'user_existing',
            authId: 'auth-user',
          }),
        ),
        insert,
      },
    }

    await expect(createUserIfNeeded.handler(ctx)).resolves.toBe('user_existing')
    expect(insert).not.toHaveBeenCalled()
  })

  it('trusts both localhost and 127.0.0.1 for the same local dev port', async () => {
    const deps = createDefineAuthDeps()
    const custom = vi.fn(() => ({ kind: 'custom-auth' }))
    vi.stubEnv('SITE_URL', 'http://127.0.0.1:4122')

    const { createAuth } = defineAuth(deps, { custom })
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
    const deps = createDefineAuthDeps()
    const custom = vi.fn(() => ({ kind: 'custom-auth' }))
    vi.stubEnv('SITE_URL', 'https://app.example.com')

    const { createAuth } = defineAuth(deps, { custom })
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
    const deps = createDefineAuthDeps()
    const { getAuthConfigProvider } = await import('@convex-dev/better-auth/auth-config')
    deps.authConfig = {
      providers: [getAuthConfigProvider()],
    }
    const custom = vi.fn((_ctx, bridge) => ({
      plugins: [
        bridge.createConvexPlugin({ foo: 'bar' }),
        { kind: 'admin-plugin' },
      ],
      trustedOrigins: bridge.trustedOrigins,
    }))

    const { createAuth } = defineAuth(deps, { custom })
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

  it('does not call onUserDeleted when no app user row existed', async () => {
    const deps = createDefineAuthDeps()
    const onUserDeleted = vi.fn()
    const { authComponent } = defineAuth(deps, { onUserDeleted })

    const deleteFn = vi.fn()
    const ctx = {
      db: {
        query: vi.fn(() => createQueryBuilder(null)), // user not found
        delete: deleteFn,
      },
    }

    // The real triggersApi() wraps handlers in internalMutationGeneric, so args
    // must be { doc, model } to match the actual Convex trigger calling convention.
    await authComponent.triggersApi().onDelete(ctx, {
      doc: { _id: 'ghost-auth-id', email: 'ghost@test.com', name: 'Ghost' },
      model: 'user',
    })

    expect(deleteFn).not.toHaveBeenCalled()
    expect(onUserDeleted).not.toHaveBeenCalled()
  })

  it('calls onUserDeleted only when the app user row was deleted', async () => {
    const deps = createDefineAuthDeps()
    const onUserDeleted = vi.fn()
    const { authComponent } = defineAuth(deps, { onUserDeleted })

    const deleteFn = vi.fn()
    const ctx = {
      db: {
        query: vi.fn(() =>
          createQueryBuilder({ _id: 'user_to_delete', authId: 'auth-user' }),
        ),
        delete: deleteFn,
      },
    }

    await authComponent.triggersApi().onDelete(ctx, {
      doc: { _id: 'auth-user', email: 'user@test.com', name: 'User' },
      model: 'user',
    })

    expect(deleteFn).toHaveBeenCalledWith('user_to_delete')
    expect(onUserDeleted).toHaveBeenCalledWith(ctx, 'auth-user')
  })

  it('createUserIfNeeded falls back to empty string when identity.email or .name is absent', async () => {
    const deps = createDefineAuthDeps()
    const { createUserIfNeeded } = defineAuth(deps)

    const insert = vi.fn(async () => 'new_user_id')
    const ctx = {
      auth: {
        // Simulates an auth provider that omits email and name (e.g. anonymous)
        getUserIdentity: vi.fn(async () => ({
          subject: 'anon-user',
          email: undefined,
          name: undefined,
        })),
      },
      db: {
        query: vi.fn(() => createQueryBuilder(null)), // no existing user
        insert,
      },
    }

    const userId = await createUserIfNeeded.handler(ctx)
    expect(userId).toBe('new_user_id')
    const insertedDoc = insert.mock.calls[0]?.[1] as Record<string, unknown>
    expect(insertedDoc.email).toBe('')
    expect(insertedDoc.displayName).toBe('')
  })

  it('patches email, displayName and updatedAt when the auth user is updated', async () => {
    const deps = createDefineAuthDeps()
    const onUserUpdated = vi.fn()
    const { authComponent } = defineAuth(deps, { onUserUpdated })

    const patchFn = vi.fn()
    const ctx = {
      db: {
        query: vi.fn(() =>
          createQueryBuilder({ _id: 'user_existing', authId: 'auth-user' }),
        ),
        patch: patchFn,
      },
    }

    // The real createClient wraps triggers in internalMutationGeneric.
    // onUpdate expects { oldDoc, newDoc, model } — the wrapper calls
    // config.triggers[model].onUpdate(ctx, newDoc, oldDoc).
    await authComponent.triggersApi().onUpdate(ctx, {
      oldDoc: { _id: 'auth-user', email: 'old@test.com', name: 'Old Name' },
      newDoc: { _id: 'auth-user', email: 'new@test.com', name: 'New Name' },
      model: 'user',
    })

    expect(patchFn).toHaveBeenCalledWith(
      'user_existing',
      expect.objectContaining({
        email: 'new@test.com',
        displayName: 'New Name',
      }),
    )
    expect(onUserUpdated).toHaveBeenCalledWith(ctx, 'user_existing')
  })

  it('does not call onUserUpdated when no app user row exists for the auth id', async () => {
    const deps = createDefineAuthDeps()
    const onUserUpdated = vi.fn()
    const { authComponent } = defineAuth(deps, { onUserUpdated })

    const patchFn = vi.fn()
    const ctx = {
      db: {
        query: vi.fn(() => createQueryBuilder(null)), // user not found
        patch: patchFn,
      },
    }

    await authComponent.triggersApi().onUpdate(ctx, {
      oldDoc: { _id: 'ghost-auth-id', email: 'ghost@test.com', name: 'Ghost' },
      newDoc: { _id: 'ghost-auth-id', email: 'ghost@test.com', name: 'Ghost' },
      model: 'user',
    })

    expect(patchFn).not.toHaveBeenCalled()
    expect(onUserUpdated).not.toHaveBeenCalled()
  })

  it('passes static JWKS to the Convex plugin when configured', async () => {
    const deps = createDefineAuthDeps()
    vi.stubEnv(
      'JWKS',
      '[{"id":"key-1","publicKey":"{\\"kty\\":\\"RSA\\"}","privateKey":"\\"secret\\"","createdAt":1}]',
    )
    vi.stubEnv('CONVEX_SITE_URL', 'http://127.0.0.1:3211')

    const { getAuthConfigProvider } = await import('@convex-dev/better-auth/auth-config')
    deps.authConfig = {
      providers: [getAuthConfigProvider({ jwks: process.env.JWKS })],
    }

    expect(() => defineAuth(deps).createAuth({})).not.toThrow()
  })

  it('does not force a Better Auth rate-limit storage backend by default', async () => {
    const deps = createDefineAuthDeps()
    const { getAuthConfigProvider } = await import('@convex-dev/better-auth/auth-config')
    deps.authConfig = {
      providers: [getAuthConfigProvider()],
    }

    const auth = defineAuth(deps).createAuth({}) as { options?: { rateLimit?: { storage?: string } } }

    expect(auth.options?.rateLimit).toBeUndefined()
  })

  it('passes through an explicit memory rate-limit override', async () => {
    const deps = createDefineAuthDeps()
    const { getAuthConfigProvider } = await import('@convex-dev/better-auth/auth-config')
    deps.authConfig = {
      providers: [getAuthConfigProvider()],
    }
    const auth = defineAuth(deps, {
      rateLimit: { storage: 'memory' },
    }).createAuth({}) as { options?: { rateLimit?: { storage?: string } } }

    expect(auth.options?.rateLimit?.storage).toBe('memory')
  })

  it('passes through an explicit database rate-limit override', async () => {
    const deps = createDefineAuthDeps()
    const { getAuthConfigProvider } = await import('@convex-dev/better-auth/auth-config')
    deps.authConfig = {
      providers: [getAuthConfigProvider()],
    }
    const auth = defineAuth(deps, {
      rateLimit: { storage: 'database' },
    }).createAuth({}) as { options?: { rateLimit?: { storage?: string } } }

    expect(auth.options?.rateLimit?.storage).toBe('database')
  })
})
