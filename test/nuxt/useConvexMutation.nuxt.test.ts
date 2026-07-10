import { ConvexError } from 'convex/values'
import { describe, expect, it, vi } from 'vitest'

import { useNuxtApp } from '#imports'

import type { ConvexAuthCoordinator } from '../../src/runtime/auth/client-engine'
import { useConvexMutation } from '../../src/runtime/composables/useConvexMutation'
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

describe('useConvexMutation (Nuxt runtime)', () => {
  it('can be created during SSR setup without a Convex client and fails when called', async () => {
    const mutation = mockFnRef<'mutation'>('testing:ssr-safe-mutation')

    const { result } = await captureInNuxt(() => useConvexMutation(mutation))

    expect(result.status.value).toBe('idle')
    await expect(result({} as never)).rejects.toThrow('Convex client is unavailable')
    expect(result.status.value).toBe('error')
    expect(result.pending.value).toBe(false)
  })

  it('tracks pending and success states and exposes result data', async () => {
    const convex = new MockConvexClient()
    const mutation = mockFnRef<'mutation'>('testing:add')
    convex.setMutationHandler('testing:add', async (args) => {
      const { value } = args as { value: string }
      return { id: 'new-id', value }
    })

    const { result } = await captureInNuxt(() => useConvexMutation(mutation), { convex })

    expect(typeof result).toBe('function')
    expect('execute' in result).toBe(false)
    expect('executeSafe' in result).toBe(false)
    expect(typeof result.safe).toBe('function')
    expect(result.status.value).toBe('idle')
    const promise = result({ value: 'hello' } as never)
    expect(result.pending.value).toBe(true)

    await expect(promise).resolves.toEqual({ id: 'new-id', value: 'hello' })
    expect(result.status.value).toBe('success')
    expect(result.error.value).toBeNull()
    expect(result.data.value).toEqual({ id: 'new-id', value: 'hello' })
  })

  it('waits for Convex auth confirmation before sending mutations', async () => {
    const convex = new MockConvexClient()
    const mutation = mockFnRef<'mutation'>('testing:auth-ready')
    const authReady = deferred<'authenticated'>()
    convex.setMutationHandler('testing:auth-ready', async (args) => {
      const { value } = args as { value: string }
      return { value }
    })

    const { result } = await captureInNuxt(
      () => {
        provideFakeCoordinator(() => authReady.promise)
        return useConvexMutation(mutation)
      },
      { convex },
    )

    const promise = result({ value: 'delayed' } as never)
    await Promise.resolve()
    expect(convex.calls.mutation).toHaveLength(0)

    authReady.resolve('authenticated')

    await expect(promise).resolves.toEqual({ value: 'delayed' })
    expect(convex.calls.mutation).toHaveLength(1)
  })

  it('calls coordinator.ready() exactly once per dispatch (snapshot semantics)', async () => {
    const convex = new MockConvexClient()
    const mutation = mockFnRef<'mutation'>('testing:auth-refresh')
    convex.setMutationHandler('testing:auth-refresh', async (args) => args)

    const ready = vi.fn(async () => 'authenticated' as const)
    const { result } = await captureInNuxt(
      () => {
        provideFakeCoordinator(ready)
        return useConvexMutation(mutation)
      },
      { convex },
    )

    await expect(result({ value: 'after-refresh' } as never)).resolves.toEqual({
      value: 'after-refresh',
    })
    expect(ready).toHaveBeenCalledTimes(1)
    expect(convex.calls.mutation).toHaveLength(1)
  })

  it('calls argless mutations with empty args', async () => {
    const convex = new MockConvexClient()
    const mutation = mockFnRef<'mutation'>('testing:argless')
    convex.setMutationHandler('testing:argless', async (args) => ({ args }))

    const { result } = await captureInNuxt(() => useConvexMutation(mutation), { convex })

    await expect(result()).resolves.toEqual({ args: {} })
    expect(convex.calls.mutation.at(-1)?.args).toEqual({})
  })

  it('tracks errors and reset() clears state', async () => {
    const convex = new MockConvexClient()
    const mutation = mockFnRef<'mutation'>('testing:fail')
    convex.setMutationHandler('testing:fail', async () => {
      throw new Error('mutation failed')
    })

    const { result } = await captureInNuxt(() => useConvexMutation(mutation), { convex })

    await expect(result({} as never)).rejects.toThrow('mutation failed')
    expect(result.status.value).toBe('error')
    expect(result.error.value?.message).toBe('mutation failed')

    result.reset()
    expect(result.status.value).toBe('idle')
    expect(result.error.value).toBeNull()
    expect(result.data.value).toBeUndefined()
  })

  it('invokes onSuccess and onError callbacks exactly once with args', async () => {
    const convex = new MockConvexClient()
    const successMutation = mockFnRef<'mutation'>('testing:callback-success')
    const failMutation = mockFnRef<'mutation'>('testing:callback-fail')
    convex.setMutationHandler('testing:callback-success', async (args) => ({
      ok: true,
      payload: args,
    }))
    convex.setMutationHandler('testing:callback-fail', async () => {
      throw new Error('callback boom')
    })

    const onSuccess = vi.fn()
    const onError = vi.fn()

    const { result } = await captureInNuxt(
      () => ({
        success: useConvexMutation(successMutation, { onSuccess }),
        fail: useConvexMutation(failMutation, { onError }),
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
    await expect(result.fail(failArgs as never)).rejects.toThrow('callback boom')
    expect(onError).toHaveBeenCalledTimes(1)
    const callbackError = onError.mock.calls[0]?.[0]
    expect(callbackError).toBeInstanceOf(Error)
    expect((callbackError as Error).message).toBe('callback boom')
    expect(onError.mock.calls[0]?.[1]).toEqual(failArgs)
  })

  it('safe never throws and returns normalized error metadata', async () => {
    const convex = new MockConvexClient()
    const mutation = mockFnRef<'mutation'>('testing:safe-fail')

    convex.setMutationHandler('testing:safe-fail', async () => {
      throw new Error('Limit reached')
    })

    const { result } = await captureInNuxt(() => useConvexMutation(mutation), { convex })
    const safeResult = await result.safe({} as never)

    expect(safeResult.ok).toBe(false)
    if (safeResult.ok) {
      throw new Error('Expected safe result to be an error')
    }
    // call-result.ts no longer parses a `LIMIT_*:` prefix out of the raw message
    // (F-31: that was an app convention, not core behavior) — the message passes
    // through verbatim and no code is synthesized from it.
    expect(safeResult.error.code).toBeUndefined()
    expect(safeResult.error.message).toBe('Limit reached')
    expect(result.status.value).toBe('error')
  })

  it('safe preserves structured ConvexError payloads as server errors', async () => {
    const convex = new MockConvexClient()
    const mutation = mockFnRef<'mutation'>('testing:safe-structured-fail')

    // vNext §7: only a real Convex application error (ConvexError) yields
    // structured extraction — `kind: 'server'` with `data` preserved verbatim and
    // `code`/`status`/`message` surfaced from the structured payload.
    convex.setMutationHandler('testing:safe-structured-fail', async () => {
      throw new ConvexError({ message: 'Structured failure', code: 'STRUCTURED', status: 422 })
    })

    const { result } = await captureInNuxt(() => useConvexMutation(mutation), { convex })
    const safeResult = await result.safe({} as never)

    expect(safeResult.ok).toBe(false)
    if (safeResult.ok) {
      throw new Error('Expected safe result to be an error')
    }
    expect(safeResult.error.kind).toBe('server')
    expect(safeResult.error.code).toBe('STRUCTURED')
    // ConvexError's own `message` is the serialized payload; structured fields
    // are surfaced from `data`, never guessed from message text.
    expect(safeResult.error.message).toContain('Structured failure')
    expect(safeResult.error.status).toBe(422)
    expect(safeResult.error.data).toEqual({
      message: 'Structured failure',
      code: 'STRUCTURED',
      status: 422,
    })
  })

  it('safe wraps domain CallResult values without flattening them', async () => {
    const convex = new MockConvexClient()
    const mutation = mockFnRef<'mutation'>('testing:safe-domain-result')

    convex.setMutationHandler('testing:safe-domain-result', async () => {
      return {
        ok: false,
        error: { message: 'Domain validation failed', code: 'DOMAIN_VALIDATION' },
      }
    })

    const { result } = await captureInNuxt(() => useConvexMutation(mutation), { convex })
    const direct = await result({} as never)
    const wrapped = await result.safe({} as never)

    expect(direct).toEqual({
      ok: false,
      error: { message: 'Domain validation failed', code: 'DOMAIN_VALIDATION' },
    })

    expect(wrapped.ok).toBe(true)
    if (!wrapped.ok) {
      throw new Error('Expected wrapped result to be successful outer CallResult')
    }
    expect(wrapped.data).toEqual(direct)
  })

  it('keeps state bound to the latest in-flight request', async () => {
    const convex = new MockConvexClient()
    const mutation = mockFnRef<'mutation'>('testing:race-mutation')

    convex.setMutationHandler('testing:race-mutation', async (args) => {
      const input = args as { value: string; delayMs: number; shouldFail?: boolean }
      await new Promise((resolve) => setTimeout(resolve, input.delayMs))
      if (input.shouldFail) {
        throw new Error(`failed:${input.value}`)
      }
      return { value: input.value }
    })

    const { result } = await captureInNuxt(() => useConvexMutation(mutation), { convex })

    const slowFail = result({ value: 'first', delayMs: 30, shouldFail: true } as never)
    const fastSuccess = result({ value: 'second', delayMs: 5 } as never)

    await expect(fastSuccess).resolves.toEqual({ value: 'second' })
    await expect(slowFail).rejects.toThrow('failed:first')
    await waitFor(() => result.pending.value === false)

    expect(result.status.value).toBe('success')
    expect(result.data.value).toEqual({ value: 'second' })
    expect(result.error.value).toBeNull()
  })

  it('does not fire onSuccess/onError for a superseded call (F-30)', async () => {
    const convex = new MockConvexClient()
    const mutation = mockFnRef<'mutation'>('testing:superseded-mutation')

    convex.setMutationHandler('testing:superseded-mutation', async (args) => {
      const input = args as { value: string; delayMs: number; shouldFail?: boolean }
      await new Promise((resolve) => setTimeout(resolve, input.delayMs))
      if (input.shouldFail) {
        throw new Error(`failed:${input.value}`)
      }
      return { value: input.value }
    })

    const onSuccess = vi.fn()
    const onError = vi.fn()

    const { result } = await captureInNuxt(
      () => useConvexMutation(mutation, { onSuccess, onError }),
      {
        convex,
      },
    )

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
