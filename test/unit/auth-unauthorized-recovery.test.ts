import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  handleUnauthorizedAuthFailure,
  normalizeRedirectTargetPath,
} from '../../src/runtime/utils/auth-unauthorized'

const useNuxtAppMock = vi.fn()
const useRuntimeConfigMock = vi.fn()

vi.mock('#imports', () => ({
  useNuxtApp: () => useNuxtAppMock(),
  useRuntimeConfig: () => useRuntimeConfigMock(),
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

  it('emits convex:unauthorized hook for unauthorized failures on other routes', async () => {
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
      'convex:unauthorized',
      expect.objectContaining({
        source: 'query',
        functionName: 'notes:list',
        redirectTo: '/auth/signin?redirect=%2Fprotected',
      }),
    )
  })
})
