import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { waitForPendingClear } from '../../src/runtime/utils/auth-pending'

describe('waitForPendingClear', () => {
  it('resolves immediately when pending is already false', async () => {
    const pending = ref(false)
    await expect(waitForPendingClear(pending)).resolves.toBe(true)
  })

  it('resolves when pending becomes false before timeout', async () => {
    vi.useFakeTimers()
    const pending = ref(true)
    const promise = waitForPendingClear(pending, { timeoutMs: 100 })

    setTimeout(() => {
      pending.value = false
    }, 25)

    await vi.advanceTimersByTimeAsync(30)
    await expect(promise).resolves.toBe(true)
    vi.useRealTimers()
  })

  it('returns false on timeout and calls onTimeout', async () => {
    vi.useFakeTimers()
    const pending = ref(true)
    const onTimeout = vi.fn()
    const promise = waitForPendingClear(pending, { timeoutMs: 50, onTimeout })

    await vi.advanceTimersByTimeAsync(60)
    await expect(promise).resolves.toBe(false)
    expect(onTimeout).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})
