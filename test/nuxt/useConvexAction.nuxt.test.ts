import { describe, expect, it, vi } from 'vitest'

import { useConvexAction } from '../../src/runtime/composables/useConvexAction'
import { MockConvexClient, mockFnRef } from '../helpers/mock-convex-client'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'
import { waitFor } from '../helpers/wait-for'

describe('useConvexAction (Nuxt runtime)', () => {
  it('tracks pending and success states and exposes result data', async () => {
    const convex = new MockConvexClient()
    const action = mockFnRef<'action'>('testing:echo')
    convex.setActionHandler('testing:echo', async (args) => {
      return { ok: true, args }
    })

    const { result } = await captureInNuxt(() => useConvexAction(action), { convex })

    expect(result.status.value).toBe('idle')
    const promise = result.execute({ message: 'hi' } as never)
    expect(result.pending.value).toBe(true)

    const value = await promise

    expect(value).toEqual({ ok: true, args: { message: 'hi' } })
    expect(result.status.value).toBe('success')
    expect(result.pending.value).toBe(false)
    expect(result.error.value).toBeNull()
    expect(result.data.value).toEqual({ ok: true, args: { message: 'hi' } })
  })

  it('tracks error and supports reset()', async () => {
    const convex = new MockConvexClient()
    const action = mockFnRef<'action'>('testing:fails')
    convex.setActionHandler('testing:fails', async () => {
      throw new Error('boom')
    })

    const { result } = await captureInNuxt(() => useConvexAction(action), { convex })

    await expect(result.execute({} as never)).rejects.toThrow('boom')
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
    await expect(result.success.execute(successArgs as never)).resolves.toEqual({
      ok: true,
      payload: successArgs,
    })
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(onSuccess).toHaveBeenCalledWith({ ok: true, payload: successArgs }, successArgs)

    const failArgs = { value: 'nope' }
    await expect(result.fail.execute(failArgs as never)).rejects.toThrow('action callback boom')
    expect(onError).toHaveBeenCalledTimes(1)
    const callbackError = onError.mock.calls[0]?.[0]
    expect(callbackError).toBeInstanceOf(Error)
    expect((callbackError as Error).message).toBe('action callback boom')
    expect(onError.mock.calls[0]?.[1]).toEqual(failArgs)
  })

  it('executeSafe never throws and returns normalized errors', async () => {
    const convex = new MockConvexClient()
    const action = mockFnRef<'action'>('testing:safe-action-fail')
    convex.setActionHandler('testing:safe-action-fail', async () => {
      throw new Error('LIMIT_ACTIONS: Action limit reached')
    })

    const { result } = await captureInNuxt(() => useConvexAction(action), { convex })
    const safeResult = await result.executeSafe({} as never)

    expect(safeResult.ok).toBe(false)
    if (safeResult.ok) {
      throw new Error('Expected safe result to be an error')
    }
    expect(safeResult.error.code).toBe('LIMIT_ACTIONS')
    expect(safeResult.error.message).toBe('Action limit reached')
  })

  it('executeSafe wraps domain CallResult values without flattening them', async () => {
    const convex = new MockConvexClient()
    const action = mockFnRef<'action'>('testing:safe-domain-result')
    convex.setActionHandler('testing:safe-domain-result', async () => {
      return {
        ok: false,
        error: { message: 'Action domain failure', code: 'ACTION_DOMAIN' },
      }
    })

    const { result } = await captureInNuxt(() => useConvexAction(action), { convex })
    const direct = await result.execute({} as never)
    const wrapped = await result.executeSafe({} as never)

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

    const slowFail = result.execute({ value: 'first', delayMs: 30, shouldFail: true } as never)
    const fastSuccess = result.execute({ value: 'second', delayMs: 5 } as never)

    await expect(fastSuccess).resolves.toEqual({ value: 'second' })
    await expect(slowFail).rejects.toThrow('failed:first')
    await waitFor(() => result.pending.value === false)

    expect(result.status.value).toBe('success')
    expect(result.data.value).toEqual({ value: 'second' })
    expect(result.error.value).toBeNull()
  })
})
