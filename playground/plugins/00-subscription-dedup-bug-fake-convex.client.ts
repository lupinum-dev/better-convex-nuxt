import type {
  ConvexProvideValue,
  SubscriptionDedupHarness,
} from '~~/utils/subscription-dedup-harness'

export default defineNuxtPlugin({
  name: 'subscription-dedup-bug-fake-convex',
  enforce: 'pre',
  setup(nuxtApp) {
    const pathname = window.location.pathname
    if (!pathname.startsWith('/labs/query-features/subscription-dedup-')) {
      return
    }
    const runtimeConfig = useRuntimeConfig()

    type CounterListener = (value: number) => void
    type ErrorListener = (error: Error) => void

    class FakeConvexClient implements SubscriptionDedupHarness {
      constructor(private autoInitialResult: boolean) {}

      private counter = 0
      private listeners = new Map<string, Set<CounterListener>>()
      private errorListeners = new Map<string, Set<ErrorListener>>()

      onUpdate(
        query: unknown,
        args: unknown,
        onResult: CounterListener,
        onError?: (error: Error) => void,
      ) {
        const key = this.getKey(query, args)
        let resultSet = this.listeners.get(key)
        if (!resultSet) {
          resultSet = new Set()
          this.listeners.set(key, resultSet)
        }
        resultSet.add(onResult)

        if (onError) {
          let errorSet = this.errorListeners.get(key)
          if (!errorSet) {
            errorSet = new Set()
            this.errorListeners.set(key, errorSet)
          }
          errorSet.add(onError)
        }

        if (this.autoInitialResult) {
          queueMicrotask(() => {
            if (resultSet?.has(onResult)) {
              onResult(this.counter)
            }
          })
        }

        return () => {
          const currentResults = this.listeners.get(key)
          if (currentResults) {
            currentResults.delete(onResult)
          }
          if (currentResults && currentResults.size === 0) {
            this.listeners.delete(key)
          }

          if (onError) {
            const currentErrors = this.errorListeners.get(key)
            if (currentErrors) {
              currentErrors.delete(onError)
              if (currentErrors.size === 0) {
                this.errorListeners.delete(key)
              }
            }
          }
        }
      }

      increment() {
        this.counter += 1
        this.emitCurrent()
      }

      emitCurrent() {
        const listeners = this.listeners.get(this.getKey({ _path: 'counter:get' }, {}))
        for (const listener of listeners ?? []) {
          listener(this.counter)
        }
      }

      emitError(message = 'Simulated subscription error') {
        const listeners = this.errorListeners.get(this.getKey({ _path: 'counter:get' }, {}))
        for (const listener of listeners ?? []) {
          listener(new Error(message))
        }
      }

      getCounter() {
        return this.counter
      }

      getListenerCount(queryKey?: string) {
        if (queryKey) {
          return this.listeners.get(queryKey)?.size ?? 0
        }
        let total = 0
        for (const listeners of this.listeners.values()) {
          total += listeners.size
        }
        return total
      }

      private getKey(query: unknown, args: unknown) {
        const fn =
          typeof (query as { _path?: unknown })?._path === 'string'
            ? (query as { _path: string })._path
            : 'unknown'
        return `${fn}:${JSON.stringify(args ?? {})}`
      }
    }

    const fakeConvex = new FakeConvexClient(
      pathname !== '/labs/query-features/subscription-dedup-error-before-data',
    )

    if (!runtimeConfig.public.convex) {
      ;(runtimeConfig.public as Record<string, unknown>).convex = {}
    }
    const convexConfig = runtimeConfig.public.convex as { url?: string }
    if (!convexConfig.url) {
      convexConfig.url = 'https://example.com'
    }

    // Skip the real Convex plugin for this page and install the fake client instead.
    nuxtApp._convexInitialized = true
    nuxtApp.provide('convex', fakeConvex as unknown as ConvexProvideValue)
    window.__subscriptionDedupBugFakeConvex = fakeConvex
  },
})
