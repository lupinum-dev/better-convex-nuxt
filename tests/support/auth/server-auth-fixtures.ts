/**
 * Shared fixtures for server-side auth tests.
 *
 * Provides mock implementations for Nuxt server utilities (`useStorage`,
 * `useRuntimeConfig`, `useEvent`), a realistic `mockConvexConfig` factory,
 * and an in-memory storage backend for testing cache behavior.
 */
import type { H3Event } from 'h3'
import { vi } from 'vitest'

import type { NormalizedConvexRuntimeConfig } from '../../../src/runtime/convex/shared/runtime-config'

export const useStorageMock = vi.fn()
export const useRuntimeConfigMock = vi.fn()
export const useEventMock = vi.fn()

export const backingStore = new Map<string, unknown>()
export const storageSetCalls: Array<{ key: string; value: unknown; ttl?: number }> = []

export function createEvent(cookie?: string): H3Event {
  return {
    __is_event__: true,
    context: {},
    node: {
      req: {
        headers: {
          ...(cookie ? { cookie } : {}),
          host: '127.0.0.1:4122',
        },
        socket: {
          remoteAddress: '127.0.0.1',
        },
      },
      res: {},
    },
  } as unknown as H3Event
}

export function mockConvexConfig(
  overrides?: Record<string, unknown>,
): NormalizedConvexRuntimeConfig {
  const authOverrides = (overrides?.auth ?? {}) as Partial<NormalizedConvexRuntimeConfig['auth']>
  const permissionsOverrides = (overrides?.permissions ?? {}) as Partial<
    NormalizedConvexRuntimeConfig['permissions']
  >
  const queryOverrides = (overrides?.query ?? {}) as Partial<NormalizedConvexRuntimeConfig['query']>
  const uploadOverrides = (overrides?.upload ?? {}) as Partial<
    NormalizedConvexRuntimeConfig['upload']
  >

  return {
    url: typeof overrides?.url === 'string' ? overrides.url : 'http://127.0.0.1:3210',
    siteUrl: typeof overrides?.siteUrl === 'string' ? overrides.siteUrl : 'http://127.0.0.1:3211',
    auth: {
      enabled: true,
      route: '/api/auth',
      trustedOrigins: [],
      skipAuthTokenFetchRoutes: [],
      routeProtection: {
        redirectTo: '/auth/signin',
        preserveReturnTo: true,
      },
      unauthorized: {
        enabled: false,
        redirectTo: '/auth/signin',
        includeQueries: false,
      },
      cache: {
        enabled: true,
        ttl: 60,
      },
      proxy: {
        maxRequestBodyBytes: 1_048_576,
        maxResponseBodyBytes: 1_048_576,
      },
      ...authOverrides,
    },
    permissions: {
      query: null,
      ...permissionsOverrides,
    },
    query: {
      server: true,
      subscribe: true,
      ...queryOverrides,
    },
    upload: {
      maxConcurrent: 3,
      ...uploadOverrides,
    },
    observability: {
      enabled: false,
      service: 'test-auth-fixture',
      capture: {
        backend: false,
        mcp: false,
        browser: false,
      },
      level: 'critical',
      sample: {},
      correlation: {
        header: 'x-trellis-correlation-id',
      },
    },
  }
}

export function installServerAuthStorageMock(
  storageMock: { mockImplementation: (impl: () => unknown) => void } = useStorageMock,
) {
  storageMock.mockImplementation(() => ({
    async getItem<T>(key: string): Promise<T | null> {
      return (backingStore.get(key) as T) ?? null
    },
    async setItem(key: string, value: unknown, opts?: { ttl: number }) {
      backingStore.set(key, value)
      storageSetCalls.push({ key, value, ttl: opts?.ttl })
    },
    async removeItem(key: string) {
      backingStore.delete(key)
    },
  }))
}

export function resetServerAuthFixtureState() {
  backingStore.clear()
  storageSetCalls.length = 0
}
