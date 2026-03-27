import { describe, expect, it, vi } from 'vitest'

import { toCallResult } from '../../src/runtime/utils/call-result'
import { useConvexMutation } from '../../src/runtime/composables/useConvexMutation'
import { MockConvexClient, mockFnRef } from '../helpers/mock-convex-client'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'
import { waitFor } from '../helpers/wait-for'

describe('useConvexMutation (Nuxt runtime)', () => {
  it('does not throw during setup without a client and fails only on execute()', async () => {
    const mutation = mockFnRef<'mutation'>('testing:missing-client')

    const { result } = await captureInNuxt(() => useConvexMutation(mutation))

    expect(result.status.value).toBe('idle')
    await expect(result({} as never)).rejects.toThrow('Convex client is unavailable')
    expect(result.status.value).toBe('error')
  })

  it('tracks pending and success states and exposes result data', async () => {
    const convex = new MockConvexClient()
    const mutation = mockFnRef<'mutation'>('testing:add')
    convex.setMutationHandler('testing:add', async (args) => {
      const { value } = args as { value: string }
      return { id: 'new-id', value }
    })

    const { result } = await captureInNuxt(() => useConvexMutation(mutation), { convex })

    expect(result.status.value).toBe('idle')
    const promise = result({ value: 'hello' } as never)
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

  it('toCallResult never throws and returns normalized error metadata', async () => {
    const convex = new MockConvexClient()
    const mutation = mockFnRef<'mutation'>('testing:safe-fail')

    convex.setMutationHandler('testing:safe-fail', async () => {
      throw new Error('LIMIT_ITEMS: Limit reached')
    })

    const { result } = await captureInNuxt(() => useConvexMutation(mutation), { convex })
    const safeResult = await toCallResult(() => result({} as never))

    expect(safeResult.ok).toBe(false)
    if (safeResult.ok) {
      throw new Error('Expected safe result to be an error')
    }
    expect(safeResult.error.code).toBe('LIMIT_ITEMS')
    expect(safeResult.error.message).toBe('Limit reached')
    expect(result.status.value).toBe('error')
  })

  it('toCallResult prefers structured ConvexError payloads when present', async () => {
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
    const safeResult = await toCallResult(() => result({} as never))

    expect(safeResult.ok).toBe(false)
    if (safeResult.ok) {
      throw new Error('Expected safe result to be an error')
    }
    expect(safeResult.error.code).toBe('STRUCTURED')
    expect(safeResult.error.message).toBe('Structured failure')
    expect(safeResult.error.status).toBe(422)
  })

  it('toCallResult wraps domain CallResult values without flattening them', async () => {
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
    const wrapped = await toCallResult(() => result({} as never))

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
})
