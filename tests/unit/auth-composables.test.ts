import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Composable tests ─────────────────────────────────────────────────────────
// Mock useConvexAuth and useConvexAuthActions which are both imported at module
// level by the three new composables. The mocks must be hoisted so they are
// applied before any import of the modules under test.

const { useConvexAuthMock, useConvexAuthActionsMock } = vi.hoisted(() => {
  const actionsState = {
    status: { value: 'idle' },
    pending: { value: false },
    error: { value: null as Error | null },
    data: { value: undefined as unknown },
    reset: vi.fn(),
    execute: vi.fn(),
  }

  return {
    useConvexAuthMock: vi.fn(() => ({
      client: {
        signIn: { email: vi.fn(async () => ({ data: { token: 'tok' }, error: null })) },
        signUp: { email: vi.fn(async () => ({ data: { token: 'tok' }, error: null })) },
        forgetPassword: vi.fn(async () => ({ data: {}, error: null })),
        resetPassword: vi.fn(async () => ({ data: {}, error: null })),
      },
    })),
    useConvexAuthActionsMock: vi.fn(() => actionsState),
  }
})

vi.mock('../../src/runtime/composables/useConvexAuth', () => ({
  useConvexAuth: useConvexAuthMock,
}))

vi.mock('../../src/runtime/composables/useConvexAuthActions', () => ({
  useConvexAuthActions: useConvexAuthActionsMock,
}))

// ─── Server cache tests ────────────────────────────────────────────────────────
// Storage mock is used for auth-cache tests below.

const { useStorageMock } = vi.hoisted(() => ({
  useStorageMock: vi.fn(),
}))

vi.mock('nitropack/runtime', () => ({
  useStorage: useStorageMock,
}))

// ─── JWT helpers ──────────────────────────────────────────────────────────────

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

// ─── useConvexSignIn ──────────────────────────────────────────────────────────

describe('useConvexSignIn', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useConvexAuthActionsMock.mockReturnValue({
      status: { value: 'idle' },
      pending: { value: false },
      error: { value: null },
      data: { value: undefined },
      reset: vi.fn(),
      execute: vi.fn(async (fn: () => Promise<unknown>) => fn()),
    })
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('calls client.signIn.email with the provided credentials', async () => {
    const { useConvexSignIn } = await import('../../src/runtime/composables/useConvexSignIn')
    const signInMock = vi.fn(async () => ({ data: { token: 'tok' }, error: null }))
    useConvexAuthMock.mockReturnValue({
      client: { signIn: { email: signInMock } },
    })
    const { signIn } = useConvexSignIn()

    await signIn({ email: 'user@example.com', password: 's3cr3t' })

    expect(signInMock).toHaveBeenCalledWith({ email: 'user@example.com', password: 's3cr3t' })
  })

  it('forwards status/pending/error/data/reset from useConvexAuthActions', async () => {
    const { useConvexSignIn } = await import('../../src/runtime/composables/useConvexSignIn')
    const resetFn = vi.fn()
    useConvexAuthActionsMock.mockReturnValue({
      status: { value: 'success' },
      pending: { value: false },
      error: { value: null },
      data: { value: { token: 'tok' } },
      reset: resetFn,
      execute: vi.fn(),
    })

    const { status, pending: _pending, error: _error, data, reset } = useConvexSignIn()

    expect((status as { value: string }).value).toBe('success')
    reset()
    expect(resetFn).toHaveBeenCalledTimes(1)
    expect((data as { value: unknown }).value).toEqual({ token: 'tok' })
  })

  it('returns undefined and sets error when sign-in fails', async () => {
    const { useConvexSignIn } = await import('../../src/runtime/composables/useConvexSignIn')
    const authError = new Error('Invalid credentials')
    const executeMock = vi.fn(async () => undefined)
    useConvexAuthActionsMock.mockReturnValue({
      status: { value: 'error' },
      pending: { value: false },
      error: { value: authError },
      data: { value: undefined },
      reset: vi.fn(),
      execute: executeMock,
    })
    useConvexAuthMock.mockReturnValue({
      client: {
        signIn: { email: vi.fn(async () => ({ error: { message: 'Invalid credentials' } })) },
      },
    })

    const { signIn, error } = useConvexSignIn()
    const result = await signIn({ email: 'user@example.com', password: 'wrong' })

    expect(result).toBeUndefined()
    expect((error as { value: Error | null }).value).toBe(authError)
  })

  it('produces a descriptive error when client is null', async () => {
    const { useConvexSignIn } = await import('../../src/runtime/composables/useConvexSignIn')
    useConvexAuthMock.mockReturnValue({ client: null })

    const executeMock = vi.fn(async () => {})
    useConvexAuthActionsMock.mockReturnValue({
      status: { value: 'idle' },
      pending: { value: false },
      error: { value: null },
      data: { value: undefined },
      reset: vi.fn(),
      execute: executeMock,
    })

    const { signIn } = useConvexSignIn()
    await signIn({ email: 'user@example.com', password: 'pass' })

    expect(executeMock).toHaveBeenCalledTimes(1)
    // The fn passed to execute should reject with our descriptive error
    const fn = executeMock.mock.calls[0][0] as () => Promise<unknown>
    await expect(fn()).rejects.toThrow('[useConvexSignIn] Better Auth client is not available')
  })

  it('produces a descriptive error when signIn.email is unavailable', async () => {
    const { useConvexSignIn } = await import('../../src/runtime/composables/useConvexSignIn')
    useConvexAuthMock.mockReturnValue({ client: { signIn: {} } })

    const executeMock = vi.fn(async () => {})
    useConvexAuthActionsMock.mockReturnValue({
      status: { value: 'idle' },
      pending: { value: false },
      error: { value: null },
      data: { value: undefined },
      reset: vi.fn(),
      execute: executeMock,
    })

    const { signIn } = useConvexSignIn()
    await signIn({ email: 'user@example.com', password: 'pass' })

    const fn = executeMock.mock.calls[0][0] as () => Promise<unknown>
    await expect(fn()).rejects.toThrow('[useConvexSignIn] Email/password sign-in is not available')
  })

  it('forwards opts to actions.execute', async () => {
    const { useConvexSignIn } = await import('../../src/runtime/composables/useConvexSignIn')
    const executeMock = vi.fn(async (fn: () => Promise<unknown>) => fn())
    useConvexAuthActionsMock.mockReturnValue({
      status: { value: 'idle' },
      pending: { value: false },
      error: { value: null },
      data: { value: undefined },
      reset: vi.fn(),
      execute: executeMock,
    })
    useConvexAuthMock.mockReturnValue({
      client: { signIn: { email: vi.fn(async () => ({ data: {}, error: null })) } },
    })

    const { signIn } = useConvexSignIn()
    await signIn({ email: 'user@example.com', password: 'pass' }, { redirectTo: '/dashboard' })

    expect(executeMock).toHaveBeenCalledWith(expect.any(Function), { redirectTo: '/dashboard' })
  })
})

// ─── useConvexSignUp ──────────────────────────────────────────────────────────

describe('useConvexSignUp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useConvexAuthActionsMock.mockReturnValue({
      status: { value: 'idle' },
      pending: { value: false },
      error: { value: null },
      data: { value: undefined },
      reset: vi.fn(),
      execute: vi.fn(async (fn: () => Promise<unknown>) => fn()),
    })
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('calls client.signUp.email with name, email, and password', async () => {
    const { useConvexSignUp } = await import('../../src/runtime/composables/useConvexSignUp')
    const signUpMock = vi.fn(async () => ({ data: { token: 'tok' }, error: null }))
    useConvexAuthMock.mockReturnValue({
      client: { signUp: { email: signUpMock } },
    })

    const { signUp } = useConvexSignUp()
    await signUp({ email: 'new@example.com', password: 's3cr3t', name: 'Ada' })

    expect(signUpMock).toHaveBeenCalledWith({
      email: 'new@example.com',
      password: 's3cr3t',
      name: 'Ada',
    })
  })

  it('produces a descriptive error when client is null', async () => {
    const { useConvexSignUp } = await import('../../src/runtime/composables/useConvexSignUp')
    useConvexAuthMock.mockReturnValue({ client: null })

    const executeMock = vi.fn(async () => {})
    useConvexAuthActionsMock.mockReturnValue({
      status: { value: 'idle' },
      pending: { value: false },
      error: { value: null },
      data: { value: undefined },
      reset: vi.fn(),
      execute: executeMock,
    })

    const { signUp } = useConvexSignUp()
    await signUp({ email: 'new@example.com', password: 'pass', name: 'Ada' })

    const fn = executeMock.mock.calls[0][0] as () => Promise<unknown>
    await expect(fn()).rejects.toThrow('[useConvexSignUp] Better Auth client is not available')
  })

  it('produces a descriptive error when signUp.email is unavailable', async () => {
    const { useConvexSignUp } = await import('../../src/runtime/composables/useConvexSignUp')
    useConvexAuthMock.mockReturnValue({ client: { signUp: {} } })

    const executeMock = vi.fn(async () => {})
    useConvexAuthActionsMock.mockReturnValue({
      status: { value: 'idle' },
      pending: { value: false },
      error: { value: null },
      data: { value: undefined },
      reset: vi.fn(),
      execute: executeMock,
    })

    const { signUp } = useConvexSignUp()
    await signUp({ email: 'new@example.com', password: 'pass', name: 'Ada' })

    const fn = executeMock.mock.calls[0][0] as () => Promise<unknown>
    await expect(fn()).rejects.toThrow('[useConvexSignUp] Email/password sign-up is not available')
  })
})

// ─── useConvexPasswordReset ───────────────────────────────────────────────────

describe('useConvexPasswordReset', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useConvexAuthActionsMock.mockReturnValue({
      status: { value: 'idle' },
      pending: { value: false },
      error: { value: null },
      data: { value: undefined },
      reset: vi.fn(),
      execute: vi.fn(async (fn: () => Promise<unknown>) => fn()),
    })
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('forgotPassword calls client.forgetPassword with the email and a redirectTo', async () => {
    const { useConvexPasswordReset } =
      await import('../../src/runtime/composables/useConvexPasswordReset')
    const forgetPasswordMock = vi.fn(async () => ({ data: {}, error: null }))
    useConvexAuthMock.mockReturnValue({
      client: { forgetPassword: forgetPasswordMock, resetPassword: vi.fn() },
    })

    const { forgotPassword } = useConvexPasswordReset()
    await forgotPassword('user@example.com')

    expect(forgetPasswordMock).toHaveBeenCalledWith({
      email: 'user@example.com',
      redirectTo: '/reset-password',
    })
  })

  it('resetPassword calls client.resetPassword with token and newPassword', async () => {
    const { useConvexPasswordReset } =
      await import('../../src/runtime/composables/useConvexPasswordReset')
    const resetPasswordMock = vi.fn(async () => ({ data: {}, error: null }))
    useConvexAuthMock.mockReturnValue({
      client: { forgetPassword: vi.fn(), resetPassword: resetPasswordMock },
    })

    const { resetPassword } = useConvexPasswordReset()
    await resetPassword({ newPassword: 'newpass123', token: 'reset-token-abc' })

    expect(resetPasswordMock).toHaveBeenCalledWith({
      newPassword: 'newpass123',
      token: 'reset-token-abc',
    })
  })
  it('uses custom resetPagePath when provided', async () => {
    const { useConvexPasswordReset } =
      await import('../../src/runtime/composables/useConvexPasswordReset')
    const forgetPasswordMock = vi.fn(async () => ({ data: {}, error: null }))
    useConvexAuthMock.mockReturnValue({
      client: { forgetPassword: forgetPasswordMock, resetPassword: vi.fn() },
    })

    const { forgotPassword } = useConvexPasswordReset({ resetPagePath: '/custom-reset' })
    await forgotPassword('user@example.com')

    expect(forgetPasswordMock).toHaveBeenCalledWith({
      email: 'user@example.com',
      redirectTo: '/custom-reset',
    })
  })

  it('produces a descriptive error when client is null (forgotPassword)', async () => {
    const { useConvexPasswordReset } =
      await import('../../src/runtime/composables/useConvexPasswordReset')
    useConvexAuthMock.mockReturnValue({ client: null })

    const executeMock = vi.fn(async () => {})
    useConvexAuthActionsMock.mockReturnValue({
      status: { value: 'idle' },
      pending: { value: false },
      error: { value: null },
      data: { value: undefined },
      reset: vi.fn(),
      execute: executeMock,
    })

    const { forgotPassword } = useConvexPasswordReset()
    await forgotPassword('user@example.com')

    const fn = executeMock.mock.calls[0][0] as () => Promise<unknown>
    await expect(fn()).rejects.toThrow(
      '[useConvexPasswordReset] Better Auth client is not available',
    )
  })

  it('produces a descriptive error when forgetPassword is unavailable', async () => {
    const { useConvexPasswordReset } =
      await import('../../src/runtime/composables/useConvexPasswordReset')
    useConvexAuthMock.mockReturnValue({ client: { resetPassword: vi.fn() } })

    const executeMock = vi.fn(async () => {})
    useConvexAuthActionsMock.mockReturnValue({
      status: { value: 'idle' },
      pending: { value: false },
      error: { value: null },
      data: { value: undefined },
      reset: vi.fn(),
      execute: executeMock,
    })

    const { forgotPassword } = useConvexPasswordReset()
    await forgotPassword('user@example.com')

    const fn = executeMock.mock.calls[0][0] as () => Promise<unknown>
    await expect(fn()).rejects.toThrow(
      '[useConvexPasswordReset] Password reset email flow is not available',
    )
  })

  it('produces a descriptive error when resetPassword is unavailable', async () => {
    const { useConvexPasswordReset } =
      await import('../../src/runtime/composables/useConvexPasswordReset')
    useConvexAuthMock.mockReturnValue({ client: { forgetPassword: vi.fn() } })

    const executeMock = vi.fn(async () => {})
    useConvexAuthActionsMock.mockReturnValue({
      status: { value: 'idle' },
      pending: { value: false },
      error: { value: null },
      data: { value: undefined },
      reset: vi.fn(),
      execute: executeMock,
    })

    const { resetPassword } = useConvexPasswordReset()
    await resetPassword({ newPassword: 'newpass123', token: 'reset-token-abc' })

    const fn = executeMock.mock.calls[0][0] as () => Promise<unknown>
    await expect(fn()).rejects.toThrow(
      '[useConvexPasswordReset] Password reset confirmation is not available',
    )
  })
})

// ─── Server auth cache — JWT expiry validation ────────────────────────────────

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
    // Token expires in 10 s — less than TOKEN_EXPIRY_SAFETY_BUFFER_MS (30 s)
    const nearExpiryToken = makeJwt({ sub: 'user-1', exp: nowSeconds() + 10 })
    const { removeItem } = makeStorageMock(nearExpiryToken)

    const { getCachedAuthToken } = await import('../../src/runtime/server/utils/auth-cache')
    const result = await getCachedAuthToken('session-abc')

    expect(result).toBeNull()
    expect(removeItem).toHaveBeenCalledTimes(1)
  })

  it('returns the token when it has plenty of time remaining', async () => {
    // Token expires in 5 minutes — well past the 30 s buffer
    const freshToken = makeJwt({ sub: 'user-1', exp: nowSeconds() + 300 })
    const { removeItem } = makeStorageMock(freshToken)

    const { getCachedAuthToken } = await import('../../src/runtime/server/utils/auth-cache')
    const result = await getCachedAuthToken('session-abc')

    expect(result).toBe(freshToken)
    expect(removeItem).not.toHaveBeenCalled()
  })

  it('returns null (no eviction call) when storage has no cached token', async () => {
    const { removeItem } = makeStorageMock(null)

    const { getCachedAuthToken } = await import('../../src/runtime/server/utils/auth-cache')
    const result = await getCachedAuthToken('session-abc')

    expect(result).toBeNull()
    expect(removeItem).not.toHaveBeenCalled()
  })

  it('evicts and returns null when the cached token is already expired', async () => {
    // Token expired 60 seconds ago — remaining is negative
    const expiredToken = makeJwt({ sub: 'user-1', exp: nowSeconds() - 60 })
    const { removeItem } = makeStorageMock(expiredToken)

    const { getCachedAuthToken } = await import('../../src/runtime/server/utils/auth-cache')
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

    const { getCachedAuthToken } = await import('../../src/runtime/server/utils/auth-cache')
    const result = await getCachedAuthToken('session-abc')

    expect(result).toBeNull()
    expect(warnSpy).toHaveBeenCalledWith(
      '[auth-cache] Cache read failed, falling through to token exchange:',
      expect.any(Error),
    )
    warnSpy.mockRestore()
  })

  it('returns the token when it has no exp claim (undecidable expiry)', async () => {
    const noExpToken = makeJwt({ sub: 'user-1' })
    const { removeItem } = makeStorageMock(noExpToken)

    const { getCachedAuthToken } = await import('../../src/runtime/server/utils/auth-cache')
    const result = await getCachedAuthToken('session-abc')

    // Without exp, getJwtTimeUntilExpiryMs returns null → token is passed through
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

    const { serverConvexClearAuthCache } = await import('../../src/runtime/server/utils/auth-cache')

    await expect(serverConvexClearAuthCache('session-abc')).resolves.toBeUndefined()
    expect(warnSpy).toHaveBeenCalledWith('[auth-cache] Cache eviction failed:', expect.any(Error))
    warnSpy.mockRestore()
  })
})
