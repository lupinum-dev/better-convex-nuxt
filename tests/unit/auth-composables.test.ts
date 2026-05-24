import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { useBetterAuthClientMock, useBetterAuthActionsMock } = vi.hoisted(() => {
  const actionsState = {
    status: { value: 'idle' },
    pending: { value: false },
    error: { value: null as Error | null },
    data: { value: undefined as unknown },
    reset: vi.fn(),
    execute: vi.fn(),
  }

  return {
    useBetterAuthClientMock: vi.fn(() => ({
      signIn: { email: vi.fn(async () => ({ data: { token: 'tok' }, error: null })) },
      signUp: { email: vi.fn(async () => ({ data: { token: 'tok' }, error: null })) },
      forgetPassword: vi.fn(async () => ({ data: {}, error: null })),
      resetPassword: vi.fn(async () => ({ data: {}, error: null })),
    })),
    useBetterAuthActionsMock: vi.fn(() => actionsState),
  }
})

vi.mock('../../src/runtime/auth/composables/useBetterAuthClient', () => ({
  useBetterAuthClient: useBetterAuthClientMock,
}))

vi.mock('../../src/runtime/auth/composables/useBetterAuthActions', () => ({
  useBetterAuthActions: useBetterAuthActionsMock,
}))

const { useStorageMock } = vi.hoisted(() => ({
  useStorageMock: vi.fn(),
}))

vi.mock('nitropack/runtime', () => ({
  useStorage: useStorageMock,
}))

function toBase64Url(value: string): string {
  return Buffer.from(value, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function makeJwt(payload: Record<string, unknown>): string {
  const header = toBase64Url(JSON.stringify({ alg: 'none', typ: 'JWT' }))
  const body = toBase64Url(JSON.stringify(payload))
  return `${header}.${body}.sig`
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000)
}

function mockActions(execute = vi.fn(async (fn: () => Promise<unknown>) => fn())) {
  useBetterAuthActionsMock.mockReturnValue({
    status: { value: 'idle' },
    pending: { value: false },
    error: { value: null },
    data: { value: undefined },
    reset: vi.fn(),
    execute,
  })
  return execute
}

describe('Better Auth flow composables', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockActions()
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('useBetterAuthSignIn calls client.signIn.email with credentials', async () => {
    const { useBetterAuthSignIn } =
      await import('../../src/runtime/auth/composables/useBetterAuthSignIn')
    const signInMock = vi.fn(async () => ({ data: { token: 'tok' }, error: null }))
    useBetterAuthClientMock.mockReturnValue({ signIn: { email: signInMock } })

    const { signIn } = useBetterAuthSignIn()
    await signIn({ email: 'user@example.com', password: 's3cr3t' })

    expect(signInMock).toHaveBeenCalledWith({ email: 'user@example.com', password: 's3cr3t' })
  })

  it('useBetterAuthSignIn forwards status state from useBetterAuthActions', async () => {
    const { useBetterAuthSignIn } =
      await import('../../src/runtime/auth/composables/useBetterAuthSignIn')
    const resetFn = vi.fn()
    useBetterAuthActionsMock.mockReturnValue({
      status: { value: 'success' },
      pending: { value: false },
      error: { value: null },
      data: { value: { token: 'tok' } },
      reset: resetFn,
      execute: vi.fn(),
    })

    const { status, data, reset } = useBetterAuthSignIn()

    expect((status as { value: string }).value).toBe('success')
    reset()
    expect(resetFn).toHaveBeenCalledTimes(1)
    expect((data as { value: unknown }).value).toEqual({ token: 'tok' })
  })

  it('useBetterAuthSignIn produces a descriptive error when client is null', async () => {
    const { useBetterAuthSignIn } =
      await import('../../src/runtime/auth/composables/useBetterAuthSignIn')
    const executeMock = mockActions(vi.fn(async () => undefined))
    useBetterAuthClientMock.mockReturnValue(null)

    const { signIn } = useBetterAuthSignIn()
    await signIn({ email: 'user@example.com', password: 'pass' })

    const fn = executeMock.mock.calls[0]?.[0] as () => Promise<unknown>
    await expect(fn()).rejects.toThrow('[useBetterAuthSignIn] Better Auth client is not available')
  })

  it('useBetterAuthSignIn forwards options to actions.execute', async () => {
    const { useBetterAuthSignIn } =
      await import('../../src/runtime/auth/composables/useBetterAuthSignIn')
    const executeMock = mockActions(vi.fn(async (fn: () => Promise<unknown>) => fn()))
    useBetterAuthClientMock.mockReturnValue({
      signIn: { email: vi.fn(async () => ({ data: {}, error: null })) },
    })

    const { signIn } = useBetterAuthSignIn()
    await signIn({ email: 'user@example.com', password: 'pass' }, { redirectTo: '/dashboard' })

    expect(executeMock).toHaveBeenCalledWith(expect.any(Function), { redirectTo: '/dashboard' })
  })

  it('useBetterAuthSignUp calls client.signUp.email with name, email, and password', async () => {
    const { useBetterAuthSignUp } =
      await import('../../src/runtime/auth/composables/useBetterAuthSignUp')
    const signUpMock = vi.fn(async () => ({ data: { token: 'tok' }, error: null }))
    useBetterAuthClientMock.mockReturnValue({ signUp: { email: signUpMock } })

    const { signUp } = useBetterAuthSignUp()
    await signUp({ email: 'new@example.com', password: 's3cr3t', name: 'Ada' })

    expect(signUpMock).toHaveBeenCalledWith({
      email: 'new@example.com',
      password: 's3cr3t',
      name: 'Ada',
    })
  })

  it('useBetterAuthSignUp produces a descriptive error when signUp.email is unavailable', async () => {
    const { useBetterAuthSignUp } =
      await import('../../src/runtime/auth/composables/useBetterAuthSignUp')
    const executeMock = mockActions(vi.fn(async () => undefined))
    useBetterAuthClientMock.mockReturnValue({ signUp: {} })

    const { signUp } = useBetterAuthSignUp()
    await signUp({ email: 'new@example.com', password: 'pass', name: 'Ada' })

    const fn = executeMock.mock.calls[0]?.[0] as () => Promise<unknown>
    await expect(fn()).rejects.toThrow(
      '[useBetterAuthSignUp] Email/password sign-up is not available',
    )
  })

  it('useBetterAuthPasswordReset calls client.forgetPassword with email and redirectTo', async () => {
    const { useBetterAuthPasswordReset } =
      await import('../../src/runtime/auth/composables/useBetterAuthPasswordReset')
    const forgetPasswordMock = vi.fn(async () => ({ data: {}, error: null }))
    useBetterAuthClientMock.mockReturnValue({
      forgetPassword: forgetPasswordMock,
      resetPassword: vi.fn(),
    })

    const { forgotPassword } = useBetterAuthPasswordReset({ resetPagePath: '/custom-reset' })
    await forgotPassword('user@example.com')

    expect(forgetPasswordMock).toHaveBeenCalledWith({
      email: 'user@example.com',
      redirectTo: '/custom-reset',
    })
  })

  it('useBetterAuthPasswordReset calls client.resetPassword with token and newPassword', async () => {
    const { useBetterAuthPasswordReset } =
      await import('../../src/runtime/auth/composables/useBetterAuthPasswordReset')
    const resetPasswordMock = vi.fn(async () => ({ data: {}, error: null }))
    useBetterAuthClientMock.mockReturnValue({
      forgetPassword: vi.fn(),
      resetPassword: resetPasswordMock,
    })

    const { resetPassword } = useBetterAuthPasswordReset()
    await resetPassword({ newPassword: 'newpass123', token: 'reset-token-abc' })

    expect(resetPasswordMock).toHaveBeenCalledWith({
      newPassword: 'newpass123',
      token: 'reset-token-abc',
    })
  })
})

describe('getCachedAuthToken JWT-expiry eviction', () => {
  function makeStorageMock(storedValue: string | null) {
    const removeItem = vi.fn(async () => {})
    const storage = {
      getItem: vi.fn(async () => storedValue),
      setItem: vi.fn(async () => {}),
      removeItem,
    }
    useStorageMock.mockReturnValue(storage)
    return { storage, removeItem }
  }

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('evicts and returns null when the cached token is within the safety buffer of expiry', async () => {
    const nearExpiryToken = makeJwt({ sub: 'user-1', exp: nowSeconds() + 10 })
    const { removeItem } = makeStorageMock(nearExpiryToken)

    const { getCachedAuthToken } = await import('../../src/runtime/auth/server/auth-cache')
    const result = await getCachedAuthToken('session-abc')

    expect(result).toBeNull()
    expect(removeItem).toHaveBeenCalledTimes(1)
  })

  it('returns the token when it has plenty of time remaining', async () => {
    const freshToken = makeJwt({ sub: 'user-1', exp: nowSeconds() + 300 })
    const { removeItem } = makeStorageMock(freshToken)

    const { getCachedAuthToken } = await import('../../src/runtime/auth/server/auth-cache')
    const result = await getCachedAuthToken('session-abc')

    expect(result).toBe(freshToken)
    expect(removeItem).not.toHaveBeenCalled()
  })

  it('returns null when storage has no cached token', async () => {
    const { removeItem } = makeStorageMock(null)

    const { getCachedAuthToken } = await import('../../src/runtime/auth/server/auth-cache')
    const result = await getCachedAuthToken('session-abc')

    expect(result).toBeNull()
    expect(removeItem).not.toHaveBeenCalled()
  })

  it('evicts and returns null when the cached token is already expired', async () => {
    const expiredToken = makeJwt({ sub: 'user-1', exp: nowSeconds() - 60 })
    const { removeItem } = makeStorageMock(expiredToken)

    const { getCachedAuthToken } = await import('../../src/runtime/auth/server/auth-cache')
    const result = await getCachedAuthToken('session-abc')

    expect(result).toBeNull()
    expect(removeItem).toHaveBeenCalledTimes(1)
  })

  it('returns null and logs warning when storage throws', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    useStorageMock.mockReturnValue({
      getItem: vi.fn(async () => {
        throw new Error('Redis connection refused')
      }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    })

    const { getCachedAuthToken } = await import('../../src/runtime/auth/server/auth-cache')
    const result = await getCachedAuthToken('session-abc')

    expect(result).toBeNull()
    expect(warnSpy).toHaveBeenCalledWith(
      '[auth-cache] Cache read failed, falling through to token exchange:',
      expect.any(Error),
    )
    warnSpy.mockRestore()
  })

  it('returns the token when it has no exp claim', async () => {
    const noExpToken = makeJwt({ sub: 'user-1' })
    const { removeItem } = makeStorageMock(noExpToken)

    const { getCachedAuthToken } = await import('../../src/runtime/auth/server/auth-cache')
    const result = await getCachedAuthToken('session-abc')

    expect(result).toBe(noExpToken)
    expect(removeItem).not.toHaveBeenCalled()
  })

  it('logs a warning and returns when cache eviction fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    useStorageMock.mockReturnValue({
      getItem: vi.fn(async () => null),
      setItem: vi.fn(async () => {}),
      removeItem: vi.fn(async () => {
        throw new Error('Redis connection refused')
      }),
    })

    const { serverConvexClearAuthCache } = await import('../../src/runtime/auth/server/auth-cache')

    await expect(serverConvexClearAuthCache('session-abc')).resolves.toBeUndefined()
    expect(warnSpy).toHaveBeenCalledWith('[auth-cache] Cache eviction failed:', expect.any(Error))
    warnSpy.mockRestore()
  })
})
