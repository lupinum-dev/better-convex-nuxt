import { describe, expect, it, vi } from 'vitest'

import {
  fetchConvexToken,
  MAX_FETCH_ATTEMPTS,
  type ConvexTokenSource,
} from '../../src/runtime/auth/token-fetcher'

describe('client Convex token exchange deadline', () => {
  it('settles immediately and aborts the request when its owner cancels', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    let capturedSignal: AbortSignal | undefined
    let calls = 0
    const source = {
      convex: {
        token: (options?: unknown) => {
          calls += 1
          capturedSignal = (options as { fetchOptions?: { signal?: AbortSignal } } | undefined)
            ?.fetchOptions?.signal
          return new Promise<{ data: null; error: null }>((_resolve, reject) => {
            capturedSignal?.addEventListener(
              'abort',
              () => reject(new DOMException('source aborted', 'AbortError')),
              { once: true },
            )
          })
        },
      },
    } satisfies ConvexTokenSource

    try {
      const fetching = fetchConvexToken(source, { signal: controller.signal })
      controller.abort()

      await expect(fetching).resolves.toEqual({
        identity: null,
        authError: 'Convex authentication token exchange was cancelled',
        definitive: false,
      })
      expect(calls).toBe(1)
      expect(capturedSignal?.aborted).toBe(true)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('bounds a never-settling exchange, aborts it, and ignores its late result', async () => {
    vi.useFakeTimers()
    let resolveExchange!: (value: { data: null; error: null }) => void
    let capturedSignal: AbortSignal | undefined
    let calls = 0
    const source = {
      convex: {
        token: (options?: unknown) => {
          calls += 1
          capturedSignal = (options as { fetchOptions?: { signal?: AbortSignal } } | undefined)
            ?.fetchOptions?.signal
          return new Promise<{ data: null; error: null }>((resolve) => {
            resolveExchange = resolve
          })
        },
      },
    } satisfies ConvexTokenSource

    try {
      let settled = false
      const fetching = fetchConvexToken(source).then((outcome) => {
        settled = true
        return outcome
      })

      await vi.advanceTimersByTimeAsync(4_999)
      expect(settled).toBe(false)
      expect(capturedSignal?.aborted).toBe(false)

      await vi.advanceTimersByTimeAsync(1)
      await expect(fetching).resolves.toEqual({
        identity: null,
        authError: 'Convex authentication token exchange timed out',
        definitive: false,
      })
      expect(calls).toBe(1)
      expect(capturedSignal?.aborted).toBe(true)
      expect(vi.getTimerCount()).toBe(0)

      resolveExchange({ data: null, error: null })
      await Promise.resolve()
      expect(calls).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('clears the deadline after the ordinary bounded retry loop settles', async () => {
    vi.useFakeTimers()
    const signals: AbortSignal[] = []
    const source = {
      convex: {
        token: async (options?: unknown) => {
          const signal = (options as { fetchOptions?: { signal?: AbortSignal } } | undefined)
            ?.fetchOptions?.signal
          if (signal) signals.push(signal)
          return { data: null, error: { status: 503, message: 'unavailable' } }
        },
      },
    } satisfies ConvexTokenSource

    try {
      await expect(fetchConvexToken(source)).resolves.toEqual({
        identity: null,
        authError: 'unavailable',
        definitive: false,
      })
      expect(signals).toHaveLength(MAX_FETCH_ATTEMPTS)
      expect(signals.every((signal) => !signal.aborted)).toBe(true)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})
