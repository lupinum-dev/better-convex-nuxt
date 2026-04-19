import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  handleUnauthorizedAuthFailure,
  normalizeRedirectTargetPath,
} from '../../src/runtime/auth/shared/auth-unauthorized'

const useNuxtAppMock = vi.fn()
const useRuntimeConfigMock = vi.fn()
const getSharedAuthEngineMock = vi.fn()

vi.mock('#imports', () => ({
  useNuxtApp: () => useNuxtAppMock(),
  useRuntimeConfig: () => useRuntimeConfigMock(),
}))

vi.mock('../../src/runtime/auth/client/auth-engine', () => ({
  getSharedAuthEngine: (...args: unknown[]) => getSharedAuthEngineMock(...args),
}))

describe('auth unauthorized recovery', () => {
  let callHookMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    callHookMock = vi.fn(async () => {})
    useNuxtAppMock.mockReturnValue({ callHook: callHookMock })
    useRuntimeConfigMock.mockReturnValue({
      public: {
        convex: {
          auth: {
            enabled: true,
            unauthorized: {
              enabled: true,
              redirectTo: '/auth/signin?redirect=%2Fprotected',
              includeQueries: true,
            },
          },
        },
      },
    })
    // Default: user is not authenticated (session expired)
    getSharedAuthEngineMock.mockReturnValue({
      isAuthenticated: { value: false },
    })
  })

  it('normalizes redirect targets to pathname', () => {
    expect(normalizeRedirectTargetPath('/auth/signin?redirect=%2Ffoo')).toBe('/auth/signin')
    expect(normalizeRedirectTargetPath('https://app.example.com/auth/signin?redirect=%2Ffoo')).toBe(
      '/auth/signin',
    )
  })

  it('skips recovery when already on the redirect path even with query params', async () => {
    useNuxtAppMock.mockReturnValue({
      callHook: callHookMock,
      $router: {
        currentRoute: {
          value: {
            path: '/auth/signin',
            fullPath: '/auth/signin?redirect=%2Fprotected',
          },
        },
      },
    })

    const handled = await handleUnauthorizedAuthFailure({
      error: new Error('Unauthorized'),
      source: 'query',
      functionName: 'notes:list',
    })

    expect(handled).toBe(false)
    expect(callHookMock).not.toHaveBeenCalled()
  })

  it('emits trellis:unauthorized hook for unauthorized failures on other routes', async () => {
    useNuxtAppMock.mockReturnValue({
      callHook: callHookMock,
      $router: {
        currentRoute: {
          value: {
            path: '/labs/protected',
            fullPath: '/labs/protected?x=1',
          },
        },
      },
    })

    const handled = await handleUnauthorizedAuthFailure({
      error: Object.assign(new Error('Unauthorized'), { status: 401 }),
      source: 'query',
      functionName: 'notes:list',
    })

    expect(handled).toBe(true)
    expect(callHookMock).toHaveBeenCalledWith(
      'trellis:unauthorized',
      expect.objectContaining({
        source: 'query',
        functionName: 'notes:list',
        redirectTo: '/auth/signin?redirect=%2Fprotected',
      }),
    )
  })

  it('skips redirect when user is authenticated (business-logic 403, not session expiry)', async () => {
    getSharedAuthEngineMock.mockReturnValue({
      isAuthenticated: { value: true },
    })

    useNuxtAppMock.mockReturnValue({
      callHook: callHookMock,
      $router: {
        currentRoute: {
          value: {
            path: '/admin/settings',
            fullPath: '/admin/settings',
          },
        },
      },
    })

    const handled = await handleUnauthorizedAuthFailure({
      error: Object.assign(new Error('Forbidden'), { status: 403 }),
      source: 'mutation',
      functionName: 'admin:deleteUser',
    })

    expect(handled).toBe(false)
    expect(callHookMock).not.toHaveBeenCalled()
  })

  it('still redirects for 401 when user is not authenticated', async () => {
    getSharedAuthEngineMock.mockReturnValue({
      isAuthenticated: { value: false },
    })

    useNuxtAppMock.mockReturnValue({
      callHook: callHookMock,
      $router: {
        currentRoute: {
          value: {
            path: '/dashboard',
            fullPath: '/dashboard',
          },
        },
      },
    })

    const handled = await handleUnauthorizedAuthFailure({
      error: Object.assign(new Error('Unauthorized'), { status: 401 }),
      source: 'mutation',
      functionName: 'notes:create',
    })

    expect(handled).toBe(true)
    expect(callHookMock).toHaveBeenCalledWith(
      'trellis:unauthorized',
      expect.objectContaining({
        source: 'mutation',
        functionName: 'notes:create',
      }),
    )
  })

  it('falls through to redirect when auth engine is not initialized', async () => {
    getSharedAuthEngineMock.mockImplementation(() => {
      throw new Error('Auth engine not initialized')
    })

    useNuxtAppMock.mockReturnValue({
      callHook: callHookMock,
      $router: {
        currentRoute: {
          value: {
            path: '/dashboard',
            fullPath: '/dashboard',
          },
        },
      },
    })

    const handled = await handleUnauthorizedAuthFailure({
      error: Object.assign(new Error('Unauthorized'), { status: 401 }),
      source: 'query',
      functionName: 'notes:list',
    })

    expect(handled).toBe(true)
    expect(callHookMock).toHaveBeenCalled()
  })
})
