import { describe, expect, it, vi } from 'vitest'

import { useConvexAction } from '../../src/runtime/composables/useConvexAction'
import { MockConvexClient, mockFnRef } from '../helpers/mock-convex-client'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'
import { waitFor } from '../helpers/wait-for'

describe('useConvexAction (Nuxt runtime)', () => {
  it('does not throw during setup without a client and fails only on execute()', async () => {
    const action = mockFnRef<'action'>('testing:missing-client')

    const { result } = await captureInNuxt(() => useConvexAction(action))

    expect(result.status.value).toBe('idle')
    await expect(result({} as never)).rejects.toThrow('Convex client is unavailable')
    expect(result.status.value).toBe('error')
  })

  it('tracks pending and success states and exposes result data', async () => {
    const convex = new MockConvexClient()
    const action = mockFnRef<'action'>('testing:echo')
    convex.setActionHandler('testing:echo', async (args) => {
      return { ok: true, args }
    })

    const { result } = await captureInNuxt(() => useConvexAction(action), { convex })

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

  it('normalizes thrown errors into ConvexCallError metadata', async () => {
    const convex = new MockConvexClient()
    const action = mockFnRef<'action'>('testing:safe-action-fail')
    convex.setActionHandler('testing:safe-action-fail', async () => {
      throw new Error('LIMIT_ACTIONS: Action limit reached')
    })

    const { result } = await captureInNuxt(() => useConvexAction(action), { convex })
    await expect(result({} as never)).rejects.toMatchObject({
      code: 'LIMIT_ACTIONS',
      message: 'Action limit reached',
    })
  })

  it('returns a callable function with state properties attached', async () => {
    const convex = new MockConvexClient()
    const action = mockFnRef<'action'>('testing:callable-shape')
    convex.setActionHandler('testing:callable-shape', async (args) => {
      return { ok: true, args }
    })

    const { result } = await captureInNuxt(() => useConvexAction(action), { convex })

    // Must be callable as a function
    expect(typeof result).toBe('function')

    // Must have state properties
    expect(result.data).toBeDefined()
    expect(result.status).toBeDefined()
    expect(result.pending).toBeDefined()
    expect(result.error).toBeDefined()
    expect(typeof result.reset).toBe('function')

    // Initial state
    expect(result.status.value).toBe('idle')
    expect(result.pending.value).toBe(false)
    expect(result.error.value).toBeNull()
    expect(result.data.value).toBeUndefined()

    // Callable directly (not via .execute)
    const response = await result({ value: 'test' } as never)
    expect(response).toEqual({ ok: true, args: { value: 'test' } })
    expect(result.status.value).toBe('success')
    expect(result.data.value).toEqual({ ok: true, args: { value: 'test' } })
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
})
