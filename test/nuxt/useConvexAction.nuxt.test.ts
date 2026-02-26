import { describe, expect, it } from 'vitest'

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
})

