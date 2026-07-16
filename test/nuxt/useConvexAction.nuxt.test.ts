import { describe, expect, it } from 'vitest'

import { useConvexAction } from '../../src/runtime/composables/useConvexAction'
import { MockConvexClient, mockFnRef } from '../helpers/mock-convex-client'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'

describe('useConvexAction (Nuxt runtime)', () => {
  it('dispatches through the action transport and exposes the shared call lifecycle', async () => {
    const convex = new MockConvexClient()
    const action = mockFnRef<'action'>('testing:echo-action')
    convex.setActionHandler('testing:echo-action', async (args) => ({ ok: true, args }))

    const { result } = await captureInNuxt(() => useConvexAction(action), { convex })

    const pending = result({ message: 'hello' } as never)
    expect(result.pending.value).toBe(true)

    await expect(pending).resolves.toEqual({ ok: true, args: { message: 'hello' } })
    expect(convex.calls.action).toHaveLength(1)
    expect(convex.calls.action[0]?.action).toEqual(action)
    expect(convex.calls.action[0]?.args).toEqual({ message: 'hello' })
    expect(result.status.value).toBe('success')
    expect(result.error.value).toBeNull()
    expect(result.data.value).toEqual({ ok: true, args: { message: 'hello' } })
    expect(typeof result.safe).toBe('function')
    expect(typeof result.reset).toBe('function')
  })

  it('dispatches an empty object for an argless action', async () => {
    const convex = new MockConvexClient()
    const action = mockFnRef<'action'>('testing:argless-action')
    convex.setActionHandler('testing:argless-action', async (args) => args)

    const { result } = await captureInNuxt(() => useConvexAction(action), { convex })

    await expect(result()).resolves.toEqual({})
    expect(convex.calls.action.at(-1)?.args).toEqual({})
  })
})
