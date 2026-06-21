import { describe, expect, it, vi } from 'vitest'

import { useState } from '#imports'

import { useConvexUser } from '../../src/runtime/composables/useConvexUser'
import { mockFnRef } from '../helpers/mock-convex-client'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'
import { waitFor } from '../helpers/wait-for'

describe('useConvexUser composable (Nuxt runtime)', () => {
  it('seeds from session user and upgrades to canonical Better Auth user data', async () => {
    const viewer = mockFnRef<'query'>('users:viewer')
    let resolveFetch: ((value: unknown) => void) | undefined
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve
        }),
    )
    vi.stubGlobal('$fetch', fetchMock)

    const { result } = await captureInNuxt(() => {
      const token = useState<string | null>('convex:token')
      const user = useState('convex:user')
      const pending = useState<boolean>('convex:pending')

      token.value = 'jwt.token'
      user.value = {
        id: 'auth-user-1',
        name: 'Session Name',
        email: 'session@example.com',
      }
      pending.value = false

      return useConvexUser(viewer, {}, { subscribe: false })
    })

    expect(result.source.value).toBe('session')
    expect(result.data.value).toEqual({
      id: 'auth-user-1',
      name: 'Session Name',
      email: 'session@example.com',
    })

    resolveFetch?.({ value: { id: 'auth-user-1', displayName: 'Canonical Name' } })

    await waitFor(() => result.source.value === 'better-auth')
    expect(result.data.value).toEqual({
      id: 'auth-user-1',
      displayName: 'Canonical Name',
    })
    expect(result.status.value).toBe('success')
  })

  it('marks explicitly derived profile queries as projection sourced', async () => {
    const profile = mockFnRef<'query'>('profiles:viewer')
    vi.stubGlobal(
      '$fetch',
      vi.fn(async () => ({
        value: { authId: 'auth-user-2', handle: 'canonical' },
      })),
    )

    const { result } = await captureInNuxt(() => {
      const token = useState<string | null>('convex:token')
      const user = useState('convex:user')
      const pending = useState<boolean>('convex:pending')

      token.value = 'jwt.token'
      user.value = {
        id: 'auth-user-2',
        name: 'Session Name',
        email: 'session@example.com',
      }
      pending.value = false

      return useConvexUser(profile, {}, { source: 'projection', subscribe: false })
    })

    await waitFor(() => result.source.value === 'projection')
    expect(result.data.value).toEqual({ authId: 'auth-user-2', handle: 'canonical' })
  })

  it('skips canonical user query while signed out', async () => {
    const viewer = mockFnRef<'query'>('users:viewer')
    const fetchMock = vi.fn()
    vi.stubGlobal('$fetch', fetchMock)

    const { result } = await captureInNuxt(() => {
      const token = useState<string | null>('convex:token')
      const user = useState('convex:user')
      const pending = useState<boolean>('convex:pending')

      token.value = null
      user.value = null
      pending.value = false

      return useConvexUser(viewer, {}, { subscribe: false })
    })

    expect(result.data.value).toBeNull()
    expect(result.source.value).toBe('none')
    expect(result.status.value).toBe('idle')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('ignores stale canonical user results after sign-out clears session state', async () => {
    const viewer = mockFnRef<'query'>('users:viewer')
    let resolveFetch: ((value: unknown) => void) | undefined
    vi.stubGlobal(
      '$fetch',
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve
          }),
      ),
    )

    const { result } = await captureInNuxt(() => {
      const token = useState<string | null>('convex:token')
      const user = useState('convex:user')
      const pending = useState<boolean>('convex:pending')

      token.value = 'jwt.token'
      user.value = {
        id: 'auth-user-3',
        name: 'Session Name',
        email: 'session@example.com',
      }
      pending.value = false

      return {
        token,
        sessionUser: user,
        currentUser: useConvexUser(viewer, {}, { subscribe: false }),
      }
    })

    await waitFor(() => Boolean(resolveFetch))

    result.token.value = null
    result.sessionUser.value = null
    resolveFetch?.({ value: { id: 'auth-user-3', displayName: 'Late Result' } })

    await Promise.resolve()

    expect(result.currentUser.data.value).toBeNull()
    expect(result.currentUser.source.value).toBe('none')
    expect(result.currentUser.status.value).toBe('idle')
  })
})
