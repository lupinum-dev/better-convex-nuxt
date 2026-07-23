import { describe, expect, it, vi } from 'vitest'

import { createAuthOperationCoordinator } from '../../src/runtime/auth/pending-operations'

describe('auth operation coordinator', () => {
  it('runs identity-changing operations in invocation order and survives rejection', async () => {
    const coordinator = createAuthOperationCoordinator()
    const order: string[] = []
    let releaseFirst!: () => void

    const first = coordinator.run(
      () =>
        new Promise<void>((resolve) => {
          order.push('first:start')
          releaseFirst = () => {
            order.push('first:end')
            resolve()
          }
        }),
    )
    const second = coordinator.run(async () => {
      order.push('second')
      throw new Error('expected')
    })
    const third = coordinator.run(async () => {
      order.push('third')
    })

    expect(coordinator.isPending.value).toBe(true)
    await Promise.resolve()
    expect(order).toEqual(['first:start'])
    releaseFirst()
    await first
    await expect(second).rejects.toThrow('expected')
    await third
    expect(order).toEqual(['first:start', 'first:end', 'second', 'third'])
    expect(coordinator.isPending.value).toBe(false)
  })

  it('deduplicates refresh within one identity generation', async () => {
    const coordinator = createAuthOperationCoordinator()
    let release!: () => void
    const refresh = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )

    const first = coordinator.refresh(7, refresh)
    const second = coordinator.refresh(7, refresh)
    expect(second).toBe(first)
    await Promise.resolve()
    expect(refresh).toHaveBeenCalledTimes(1)
    release()
    await Promise.all([first, second])

    await coordinator.refresh(8, async () => {})
    expect(coordinator.isPending.value).toBe(false)
  })
})
