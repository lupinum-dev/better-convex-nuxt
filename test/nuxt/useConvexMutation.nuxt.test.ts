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
    const promise = result.execute({ value: 'hello' } as never)
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

    await expect(result.execute({} as never)).rejects.toThrow('mutation failed')
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
    await expect(result.fail.execute(failArgs as never)).rejects.toThrow('callback boom')
    expect(onError).toHaveBeenCalledTimes(1)
    const callbackError = onError.mock.calls[0]?.[0]
    expect(callbackError).toBeInstanceOf(Error)
    expect((callbackError as Error).message).toBe('callback boom')
    expect(onError.mock.calls[0]?.[1]).toEqual(failArgs)
  })

  it('executeSafe never throws and returns normalized error metadata', async () => {
    const convex = new MockConvexClient()
    const mutation = mockFnRef<'mutation'>('testing:safe-fail')

    convex.setMutationHandler('testing:safe-fail', async () => {
      throw new Error('LIMIT_ITEMS: Limit reached')
    })

    const { result } = await captureInNuxt(() => useConvexMutation(mutation), { convex })
    const safeResult = await result.executeSafe({} as never)

    expect(safeResult.ok).toBe(false)
    if (safeResult.ok) {
      throw new Error('Expected safe result to be an error')
    }
    expect(safeResult.error.code).toBe('LIMIT_ITEMS')
    expect(safeResult.error.message).toBe('Limit reached')
    expect(result.status.value).toBe('error')
  })

  it('executeSafe prefers structured ConvexError payloads when present', async () => {
    const convex = new MockConvexClient()
    const mutation = mockFnRef<'mutation'>('testing:safe-structured-fail')

    convex.setMutationHandler('testing:safe-structured-fail', async () => {
      const error = new Error('fallback message') as Error & {
        data?: { message: string; code: string; status: number }
      }
      error.data = { message: 'Structured failure', code: 'STRUCTURED', status: 422 }
      throw error
    })

    const { result } = await captureInNuxt(() => useConvexMutation(mutation), { convex })
    const safeResult = await result.executeSafe({} as never)

    expect(safeResult.ok).toBe(false)
    if (safeResult.ok) {
      throw new Error('Expected safe result to be an error')
    }
    expect(safeResult.error.code).toBe('STRUCTURED')
    expect(safeResult.error.message).toBe('Structured failure')
    expect(safeResult.error.status).toBe(422)
  })

  it('executeSafe wraps domain CallResult values without flattening them', async () => {
    const convex = new MockConvexClient()
    const mutation = mockFnRef<'mutation'>('testing:safe-domain-result')

    convex.setMutationHandler('testing:safe-domain-result', async () => {
      return {
        ok: false,
        error: { message: 'Domain validation failed', code: 'DOMAIN_VALIDATION' },
      }
    })

    const { result } = await captureInNuxt(() => useConvexMutation(mutation), { convex })
    const direct = await result.execute({} as never)
    const wrapped = await result.executeSafe({} as never)

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
})
