import type { H3Event } from 'h3'
import { vi } from 'vitest'

export const useStorageMock = vi.fn()
export const useRuntimeConfigMock = vi.fn()
export const useEventMock = vi.fn()

export const backingStore = new Map<string, unknown>()
export const storageSetCalls: Array<{ key: string, value: unknown, ttl?: number }> = []

export function createEvent(cookie?: string): H3Event {
  return {
    __is_event__: true,
    context: {},
    node: {
      req: { headers: cookie ? { cookie } : {} },
      res: {},
    },
  } as unknown as H3Event
}

export function mockConvexConfig(overrides?: Record<string, unknown>) {
  return {
    url: 'http://127.0.0.1:3210',
    siteUrl: 'http://127.0.0.1:3211',
    auth: {
      enabled: true,
      route: '/api/auth',
      trustedOrigins: [],
      skipAuthRoutes: [],
      cache: {
        enabled: true,
        ttl: 60,
      },
      proxy: {
        maxRequestBodyBytes: 1_048_576,
        maxResponseBodyBytes: 1_048_576,
      },
    },
    query: {
      server: true,
      subscribe: true,
    },
    upload: {
      maxConcurrent: 3,
    },
    permissions: false,
    logging: false,
    debug: {
      authFlow: false,
      clientAuthFlow: false,
      serverAuthFlow: false,
    },
    ...overrides,
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
