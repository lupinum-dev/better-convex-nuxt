import { describe, expect, it, vi } from 'vitest'

import { useConvexMutation } from '../../src/runtime/composables/useConvexMutation'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'
import { MockConvexClient, mockFnRef } from '../helpers/mock-convex-client'

describe('useConvexMutation (Nuxt runtime)', () => {
  it('tracks pending and success states and exposes result data', async () => {
    const convex = new MockConvexClient()
    const mutation = mockFnRef<'mutation'>('testing:add')
    convex.setMutationHandler('testing:add', async (args) => {
      const { value } = args as { value: string }
      return { id: 'new-id', value }
    })

    const { result } = await captureInNuxt(() => useConvexMutation(mutation), { convex })

    expect(result.status.value).toBe('idle')
    const promise = result.mutate({ value: 'hello' } as never)
    expect(result.pending.value).toBe(true)

    await expect(promise).resolves.toEqual({ id: 'new-id', value: 'hello' })
    expect(result.status.value).toBe('success')
    expect(result.error.value).toBeNull()
    expect(result.data.value).toEqual({ id: 'new-id', value: 'hello' })
  })

  it('tracks errors and reset() clears state', async () => {
    const convex = new MockConvexClient()
    const mutation = mockFnRef<'mutation'>('testing:fail')
    convex.setMutationHandler('testing:fail', async () => {
      throw new Error('mutation failed')
    })

    const { result } = await captureInNuxt(() => useConvexMutation(mutation), { convex })

    await expect(result.mutate({} as never)).rejects.toThrow('mutation failed')
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
    await expect(result.success.mutate(successArgs as never)).resolves.toEqual({
      ok: true,
      payload: successArgs,
    })
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(onSuccess).toHaveBeenCalledWith(
      { ok: true, payload: successArgs },
      successArgs,
    )

    const failArgs = { value: 'nope' }
    await expect(result.fail.mutate(failArgs as never)).rejects.toThrow('callback boom')
    expect(onError).toHaveBeenCalledTimes(1)
    const callbackError = onError.mock.calls[0]?.[0]
    expect(callbackError).toBeInstanceOf(Error)
    expect((callbackError as Error).message).toBe('callback boom')
    expect(onError.mock.calls[0]?.[1]).toEqual(failArgs)
  })
})
