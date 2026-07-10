import { describe, expect, it, vi } from 'vitest'

import { useNuxtApp } from '#imports'

import type { ConvexAuthCoordinator } from '../../src/runtime/auth/client-engine'
import { useConvexAction } from '../../src/runtime/composables/useConvexAction'
import { MockConvexClient, mockFnRef } from '../helpers/mock-convex-client'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'
import { waitFor } from '../helpers/wait-for'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, resolve, reject }
}

/**
 * Provide a fake `$convexAuthCoordinator` (Phase 3: `ensureConvexAuthReady`
 * awaits `coordinator.ready()` — a single snapshot call, not a polling loop).
 */
function provideFakeCoordinator(ready: () => Promise<unknown>) {
  const app = useNuxtApp()
  const coordinator = { ready } as unknown as ConvexAuthCoordinator
  Object.defineProperty(app, '$convexAuthCoordinator', {
    configurable: true,
    value: coordinator,
  })
  return coordinator
}

describe('useConvexAction (Nuxt runtime)', () => {
  it('can be created during SSR setup without a Convex client and fails when called', async () => {
    const action = mockFnRef<'action'>('testing:ssr-safe-action')

    const { result } = await captureInNuxt(() => useConvexAction(action))

    expect(result.status.value).toBe('idle')
    await expect(result({} as never)).rejects.toThrow('Convex client is unavailable')
    expect(result.status.value).toBe('error')
    expect(result.pending.value).toBe(false)
  })

  it('tracks pending and success states and exposes result data', async () => {
    const convex = new MockConvexClient()
    const action = mockFnRef<'action'>('testing:echo')
    convex.setActionHandler('testing:echo', async (args) => {
      return { ok: true, args }
    })

    const { result } = await captureInNuxt(() => useConvexAction(action), { convex })

    expect(typeof result).toBe('function')
    expect('execute' in result).toBe(false)
    expect('executeSafe' in result).toBe(false)
    expect(typeof result.safe).toBe('function')
    expect(result.status.value).toBe('idle')
    const promise = result({ message: 'hi' } as never)
    expect(result.pending.value).toBe(true)

    const value = await promise

    expect(value).toEqual({ ok: true, args: { message: 'hi' } })
    expect(result.status.value).toBe('success')
    expect(result.pending.value).toBe(false)
    expect(result.error.value).toBeNull()
    expect(result.data.value).toEqual({ ok: true, args: { message: 'hi' } })
  })

  it('waits for Convex auth confirmation before sending actions', async () => {
    const convex = new MockConvexClient()
    const action = mockFnRef<'action'>('testing:auth-ready-action')
    const authReady = deferred<'authenticated'>()
    convex.setActionHandler('testing:auth-ready-action', async (args) => args)

    const { result } = await captureInNuxt(
      () => {
        provideFakeCoordinator(() => authReady.promise)
        return useConvexAction(action)
      },
      { convex },
    )

    const promise = result({ value: 'delayed' } as never)
    await Promise.resolve()
    expect(convex.calls.action).toHaveLength(0)

    authReady.resolve('authenticated')

    await expect(promise).resolves.toEqual({ value: 'delayed' })
    expect(convex.calls.action).toHaveLength(1)
  })

  it('calls coordinator.ready() exactly once per dispatch (snapshot semantics)', async () => {
    const convex = new MockConvexClient()
    const action = mockFnRef<'action'>('testing:auth-refresh-action')
    convex.setActionHandler('testing:auth-refresh-action', async (args) => args)

    const ready = vi.fn(async () => 'authenticated' as const)
    const { result } = await captureInNuxt(
      () => {
        provideFakeCoordinator(ready)
        return useConvexAction(action)
      },
      { convex },
    )

    await expect(result({ value: 'after-refresh' } as never)).resolves.toEqual({
      value: 'after-refresh',
    })
    expect(ready).toHaveBeenCalledTimes(1)
    expect(convex.calls.action).toHaveLength(1)
  })

  it('calls argless actions with empty args', async () => {
    const convex = new MockConvexClient()
    const action = mockFnRef<'action'>('testing:argless-action')
    convex.setActionHandler('testing:argless-action', async (args) => ({ args }))

    const { result } = await captureInNuxt(() => useConvexAction(action), { convex })

    await expect(result()).resolves.toEqual({ args: {} })
    expect(convex.calls.action.at(-1)?.args).toEqual({})
  })

  it('tracks error and supports reset()', async () => {
    const convex = new MockConvexClient()
    const action = mockFnRef<'action'>('testing:fails')
    convex.setActionHandler('testing:fails', async () => {
      throw new Error('boom')
    })

    const { result } = await captureInNuxt(() => useConvexAction(action), { convex })

    await expect(result({} as never)).rejects.toThrow('boom')
    expect(result.status.value).toBe('error')
    expect(result.error.value?.message).toBe('boom')

    result.reset()
    expect(result.status.value).toBe('idle')
    expect(result.error.value).toBeNull()
    expect(result.data.value).toBeUndefined()
  })

  it('invokes onSuccess and onError callbacks exactly once with args', async () => {
    const convex = new MockConvexClient()
    const successAction = mockFnRef<'action'>('testing:callback-success')
    const failAction = mockFnRef<'action'>('testing:callback-fail')
    convex.setActionHandler('testing:callback-success', async (args) => ({
      ok: true,
      payload: args,
    }))
    convex.setActionHandler('testing:callback-fail', async () => {
      throw new Error('action callback boom')
    })

    const onSuccess = vi.fn()
    const onError = vi.fn()

    const { result } = await captureInNuxt(
      () => ({
        success: useConvexAction(successAction, { onSuccess }),
        fail: useConvexAction(failAction, { onError }),
      }),
      { convex },
    )

    const successArgs = { value: 'ok' }
    await expect(result.success(successArgs as never)).resolves.toEqual({
      ok: true,
      payload: successArgs,
    })
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(onSuccess).toHaveBeenCalledWith({ ok: true, payload: successArgs }, successArgs)

    const failArgs = { value: 'nope' }
    await expect(result.fail(failArgs as never)).rejects.toThrow('action callback boom')
    expect(onError).toHaveBeenCalledTimes(1)
    const callbackError = onError.mock.calls[0]?.[0]
    expect(callbackError).toBeInstanceOf(Error)
    expect((callbackError as Error).message).toBe('action callback boom')
    expect(onError.mock.calls[0]?.[1]).toEqual(failArgs)
  })

  it('safe never throws and returns normalized errors', async () => {
    const convex = new MockConvexClient()
    const action = mockFnRef<'action'>('testing:safe-action-fail')
    convex.setActionHandler('testing:safe-action-fail', async () => {
      throw new Error('Action limit reached')
    })

    const { result } = await captureInNuxt(() => useConvexAction(action), { convex })
    const safeResult = await result.safe({} as never)

    expect(safeResult.ok).toBe(false)
    if (safeResult.ok) {
      throw new Error('Expected safe result to be an error')
    }
    // call-result.ts no longer parses a `LIMIT_*:` prefix out of the raw message
    // — the message passes through verbatim and no code is synthesized.
    expect(safeResult.error.code).toBeUndefined()
    expect(safeResult.error.message).toBe('Action limit reached')
  })

  it('safe wraps domain CallResult values without flattening them', async () => {
    const convex = new MockConvexClient()
    const action = mockFnRef<'action'>('testing:safe-domain-result')
    convex.setActionHandler('testing:safe-domain-result', async () => {
      return {
        ok: false,
        error: { message: 'Action domain failure', code: 'ACTION_DOMAIN' },
      }
    })

    const { result } = await captureInNuxt(() => useConvexAction(action), { convex })
    const direct = await result({} as never)
    const wrapped = await result.safe({} as never)

    expect(direct).toEqual({
      ok: false,
      error: { message: 'Action domain failure', code: 'ACTION_DOMAIN' },
    })

    expect(wrapped.ok).toBe(true)
    if (!wrapped.ok) {
      throw new Error('Expected wrapped result to be successful outer CallResult')
    }
    expect(wrapped.data).toEqual(direct)
  })

  it('keeps state bound to the latest in-flight request', async () => {
    const convex = new MockConvexClient()
    const action = mockFnRef<'action'>('testing:race-action')
    convex.setActionHandler('testing:race-action', async (args) => {
      const input = args as { value: string; delayMs: number; shouldFail?: boolean }
      await new Promise((resolve) => setTimeout(resolve, input.delayMs))
      if (input.shouldFail) {
        throw new Error(`failed:${input.value}`)
      }
      return { value: input.value }
    })

    const { result } = await captureInNuxt(() => useConvexAction(action), { convex })

    const slowFail = result({ value: 'first', delayMs: 30, shouldFail: true } as never)
    const fastSuccess = result({ value: 'second', delayMs: 5 } as never)

    await expect(fastSuccess).resolves.toEqual({ value: 'second' })
    await expect(slowFail).rejects.toThrow('failed:first')
    await waitFor(() => result.pending.value === false)

    expect(result.status.value).toBe('success')
    expect(result.data.value).toEqual({ value: 'second' })
    expect(result.error.value).toBeNull()
  })

  it('does not fire onSuccess/onError for a superseded call', async () => {
    const convex = new MockConvexClient()
    const action = mockFnRef<'action'>('testing:superseded-action')

    convex.setActionHandler('testing:superseded-action', async (args) => {
      const input = args as { value: string; delayMs: number; shouldFail?: boolean }
      await new Promise((resolve) => setTimeout(resolve, input.delayMs))
      if (input.shouldFail) {
        throw new Error(`failed:${input.value}`)
      }
      return { value: input.value }
    })

    const onSuccess = vi.fn()
    const onError = vi.fn()

    const { result } = await captureInNuxt(() => useConvexAction(action, { onSuccess, onError }), {
      convex,
    })

    const slowFail = result({ value: 'first', delayMs: 30, shouldFail: true } as never)
    const fastSuccess = result({ value: 'second', delayMs: 5 } as never)

    await expect(fastSuccess).resolves.toEqual({ value: 'second' })
    await expect(slowFail).rejects.toThrow('failed:first')
    await waitFor(() => result.pending.value === false)

    // Only the latest (winning) call's success callback should fire; the superseded
    // failing call must fire neither onSuccess nor onError.
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(onSuccess).toHaveBeenCalledWith({ value: 'second' }, { value: 'second', delayMs: 5 })
    expect(onError).not.toHaveBeenCalled()
  })
})
