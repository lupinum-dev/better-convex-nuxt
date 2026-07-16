import { ConvexError } from 'convex/values'
import { describe, expect, it, vi } from 'vitest'

import {
  createIdentityChangedError,
  isIdentityChangedError,
} from '../../src/runtime/client/identity-changed-error'
import { ConvexCallError } from '../../src/runtime/errors'
import {
  createCallableLifecycle,
  type CallableLifecycleHandlers,
} from '../../src/runtime/utils/callable-lifecycle'

function makeLifecycle<Result = string>(
  handlers: CallableLifecycleHandlers<Record<string, unknown>, Result>,
  getIdentityGeneration: () => number = () => 0,
) {
  return createCallableLifecycle<Record<string, unknown>, Result>({
    devtoolsKind: 'mutation',
    fnName: 'test:fn',
    hasOptimisticUpdate: false,
    getIdentityGeneration,
    handlers,
  })
}

describe('callable lifecycle: throwing / .safe() equivalence ', () => {
  const rawFailures: Array<{ name: string; make: () => unknown }> = [
    { name: 'plain Error', make: () => new Error('boom') },
    { name: 'ConvexError', make: () => new ConvexError({ code: 'X', reason: 'y' }) },
    { name: 'string', make: () => 'bare string failure' },
    { name: 'opaque object', make: () => ({ unrelated: 1 }) },
  ]

  for (const { name, make } of rawFailures) {
    it(`produces an equal toJSON() and both instanceof for ${name}`, async () => {
      const lifecycle = makeLifecycle({
        invoke: () => Promise.reject(make()),
      })

      let thrown: unknown
      try {
        await lifecycle.run({})
      } catch (error) {
        thrown = error
      }
      const safe = await lifecycle.safe({})

      expect(thrown).toBeInstanceOf(ConvexCallError)
      expect(safe.ok).toBe(false)
      if (safe.ok) throw new Error('expected error result')
      expect(safe.error).toBeInstanceOf(ConvexCallError)
      expect((thrown as ConvexCallError).toJSON()).toEqual(safe.error.toJSON())
    })
  }
})

describe('callable lifecycle: identity-change stale rejection (architecture invariant)', () => {
  it('rejects a mid-flight completion under a changed identity as IDENTITY_CHANGED and fires no callbacks', async () => {
    let generation = 0
    let releaseInvoke!: (value: string) => void
    const onSuccess = vi.fn()
    const onError = vi.fn()
    const logSuccess = vi.fn()
    const logError = vi.fn()

    const lifecycle = makeLifecycle(
      {
        invoke: () =>
          new Promise<string>((resolve) => {
            releaseInvoke = resolve
          }),
        onSuccess,
        onError,
        logSuccess,
        logError,
      },
      () => generation,
    )

    const pending = lifecycle.run({})

    // Identity switches while the wire call is still in flight.
    generation = 1
    lifecycle.onIdentityMaybeChanged()

    // The wire call then succeeds — but under the retired identity, so it is
    // retired rather than committed.
    releaseInvoke('wire-ok')

    let rejection: unknown
    try {
      await pending
    } catch (error) {
      rejection = error
    }

    expect(isIdentityChangedError(rejection)).toBe(true)
    expect(onSuccess).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
    expect(logSuccess).not.toHaveBeenCalled()
    expect(logError).not.toHaveBeenCalled()

    // State is masked, not showing the stale result or a spurious error.
    expect(lifecycle.status.value).toBe('idle')
    expect(lifecycle.error.value).toBeNull()
    expect(lifecycle.data.value).toBeUndefined()
  })

  it('.safe() returns the IDENTITY_CHANGED error for a stale call, never the old result', async () => {
    let generation = 0
    let releaseInvoke!: (value: string) => void

    const lifecycle = makeLifecycle(
      {
        invoke: () =>
          new Promise<string>((resolve) => {
            releaseInvoke = resolve
          }),
      },
      () => generation,
    )

    const pending = lifecycle.safe({})
    generation = 1
    lifecycle.onIdentityMaybeChanged()
    releaseInvoke('wire-ok')

    const result = await pending
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected error result')
    expect(result.error.code).toBe('IDENTITY_CHANGED')
    expect(result.error.kind).toBe('authentication')
  })

  it('passes an owner-produced IDENTITY_CHANGED rejection through without callbacks (count rejections)', async () => {
    const onError = vi.fn()
    let rejections = 0

    const lifecycle = makeLifecycle({
      // The client owner rejects a retired-generation in-flight call itself.
      invoke: () => Promise.reject(createIdentityChangedError('mutation')),
      onError,
    })

    const attempts = 3
    for (let i = 0; i < attempts; i++) {
      try {
        await lifecycle.run({})
      } catch (error) {
        if (isIdentityChangedError(error)) rejections += 1
      }
    }

    expect(rejections).toBe(attempts)
    expect(onError).not.toHaveBeenCalled()
    // No error is committed to visible state for an identity-boundary rejection.
    expect(lifecycle.error.value).toBeNull()
    expect(lifecycle.status.value).toBe('pending')
  })

  it('commits and reports a genuine (non-identity) failure with one onError call', async () => {
    const onError = vi.fn()
    const lifecycle = makeLifecycle({
      invoke: () => Promise.reject(new Error('genuine failure')),
      onError,
    })

    await expect(lifecycle.run({})).rejects.toBeInstanceOf(ConvexCallError)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(ConvexCallError)
    expect(lifecycle.status.value).toBe('error')
    expect(lifecycle.error.value?.message).toBe('genuine failure')
  })
})
