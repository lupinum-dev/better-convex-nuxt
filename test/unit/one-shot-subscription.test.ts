import { describe, expect, it, vi } from 'vitest'

import { executeQueryViaSubscriptionOnce } from '../../src/runtime/utils/one-shot-subscription'

type UpdateCb<T> = (value: T) => void
type ErrorCb = (error: Error) => void

function createMockConvexClient<T>() {
  let updateCb: UpdateCb<T> | null = null
  let errorCb: ErrorCb | null = null
  const unsubscribe = vi.fn()

  return {
    client: {
      onUpdate: vi.fn((_query, _args, onUpdate: UpdateCb<T>, onError?: ErrorCb) => {
        updateCb = onUpdate
        errorCb = onError ?? null
        return unsubscribe
      }),
    },
    emitUpdate(value: T) {
      updateCb?.(value)
    },
    emitError(error: Error) {
      errorCb?.(error)
    },
    unsubscribe,
  }
}

describe('executeQueryViaSubscriptionOnce', () => {
  it('resolves on first update and unsubscribes', async () => {
    const mock = createMockConvexClient<{ ok: boolean }>()
    const query = {} as never

    const promise = executeQueryViaSubscriptionOnce(mock.client as never, query, {} as never)
    mock.emitUpdate({ ok: true })

    await expect(promise).resolves.toEqual({ ok: true })
    expect(mock.unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('rejects on subscription error and unsubscribes', async () => {
    const mock = createMockConvexClient<unknown>()
    const promise = executeQueryViaSubscriptionOnce(mock.client as never, {} as never, {} as never)
    mock.emitError(new Error('boom'))

    await expect(promise).rejects.toThrow('boom')
    expect(mock.unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('times out and unsubscribes', async () => {
    vi.useFakeTimers()
    try {
      const mock = createMockConvexClient<unknown>()
      const promise = executeQueryViaSubscriptionOnce(mock.client as never, {} as never, {} as never, { timeoutMs: 50 })
      const assertion = expect(promise).rejects.toThrow('Timed out waiting for subscription result')

      await vi.advanceTimersByTimeAsync(51)

      await assertion
      expect(mock.unsubscribe).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('ignores late callbacks after settling', async () => {
    const mock = createMockConvexClient<{ value: number }>()
    const promise = executeQueryViaSubscriptionOnce(mock.client as never, {} as never, {} as never)
    mock.emitUpdate({ value: 1 })
    mock.emitError(new Error('late'))
    mock.emitUpdate({ value: 2 })

    await expect(promise).resolves.toEqual({ value: 1 })
    expect(mock.unsubscribe).toHaveBeenCalledTimes(1)
  })
})
