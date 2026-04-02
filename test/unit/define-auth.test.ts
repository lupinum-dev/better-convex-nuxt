import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

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
    defineAuthMocks.createClientMock.mockImplementation((_component, options) => ({
      adapter: vi.fn(() => ({ kind: 'adapter' })),
      triggersApi: () => options.triggers.user,
    }))
    defineAuthMocks.convexPluginMock.mockReturnValue({ kind: 'convex-plugin' })
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
})
