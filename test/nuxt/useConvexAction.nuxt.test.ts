import { describe, expect, it, vi } from 'vitest'

import { useConvexAction } from '../../src/runtime/composables/useConvexAction'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'
import { MockConvexClient, mockFnRef } from '../helpers/mock-convex-client'

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
    expect(onSuccess).toHaveBeenCalledWith(
      { ok: true, payload: successArgs },
      successArgs,
    )

    const failArgs = { value: 'nope' }
    await expect(result.fail.execute(failArgs as never)).rejects.toThrow('action callback boom')
    expect(onError).toHaveBeenCalledTimes(1)
    const callbackError = onError.mock.calls[0]?.[0]
    expect(callbackError).toBeInstanceOf(Error)
    expect((callbackError as Error).message).toBe('action callback boom')
    expect(onError.mock.calls[0]?.[1]).toEqual(failArgs)
  })
})
