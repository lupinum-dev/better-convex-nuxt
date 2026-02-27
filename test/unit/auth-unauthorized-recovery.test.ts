import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  handleUnauthorizedAuthFailure,
  normalizeRedirectTargetPath,
} from '../../src/runtime/utils/auth-unauthorized'

const navigateToMock = vi.fn(async (..._args: unknown[]) => {})
const useNuxtAppMock = vi.fn()
const useRouteMock = vi.fn()
const useRuntimeConfigMock = vi.fn()
const signOutMock = vi.fn(async () => {})

vi.mock('#imports', () => ({
  navigateTo: (...args: unknown[]) => navigateToMock(...args),
  useNuxtApp: () => useNuxtAppMock(),
  useRoute: () => useRouteMock(),
  useRuntimeConfig: () => useRuntimeConfigMock(),
}))

vi.mock('../../src/runtime/composables/useAuth', () => ({
  useAuth: () => ({ signOut: signOutMock }),
}))

describe('auth unauthorized recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useNuxtAppMock.mockReturnValue({})
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
    expect(normalizeRedirectTargetPath('https://app.example.com/auth/signin?redirect=%2Ffoo')).toBe('/auth/signin')
  })

  it('skips recovery when already on the redirect path even with query params', async () => {
    useRouteMock.mockReturnValue({
      path: '/auth/signin',
      fullPath: '/auth/signin?redirect=%2Fprotected',
    })

    const handled = await handleUnauthorizedAuthFailure({
      error: new Error('Unauthorized'),
      source: 'query',
      functionName: 'notes:list',
    })

    expect(handled).toBe(false)
    expect(signOutMock).not.toHaveBeenCalled()
    expect(navigateToMock).not.toHaveBeenCalled()
  })

  it('still signs out and redirects for unauthorized failures on other routes', async () => {
    useRouteMock.mockReturnValue({
      path: '/labs/protected',
      fullPath: '/labs/protected?x=1',
    })

    const handled = await handleUnauthorizedAuthFailure({
      error: new Error('Unauthorized'),
      source: 'query',
      functionName: 'notes:list',
    })

    expect(handled).toBe(true)
    expect(signOutMock).toHaveBeenCalledTimes(1)
    expect(navigateToMock).toHaveBeenCalledWith('/auth/signin?redirect=%2Fprotected')
  })
})
