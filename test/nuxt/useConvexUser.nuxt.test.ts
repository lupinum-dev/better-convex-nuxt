import { describe, expect, it, vi } from 'vitest'

import { useState } from '#imports'

import {
  ANONYMOUS_IDENTITY,
  toAuthenticatedIdentity,
  type AuthIdentity,
} from '../../src/runtime/auth/auth-identity'
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
      const identity = useState<AuthIdentity>('convex:identity')
      const pending = useState<boolean>('convex:pending')

      identity.value = toAuthenticatedIdentity('jwt.token', {
        id: 'auth-user-1',
        name: 'Session Name',
        email: 'session@example.com',
      })
      pending.value = false

      return useConvexUser(viewer, {}, { subscribe: false })
    })

    expect(result.source.value).toBe('session')
    expect(result.state.value).toEqual({
      source: 'session',
      data: {
        id: 'auth-user-1',
        name: 'Session Name',
        email: 'session@example.com',
      },
    })
    expect(result.data.value).toEqual({
      id: 'auth-user-1',
      name: 'Session Name',
      email: 'session@example.com',
    })

    resolveFetch?.({ value: { id: 'auth-user-1', displayName: 'Canonical Name' } })

    await waitFor(() => result.source.value === 'better-auth')
    expect(result.state.value).toEqual({
      source: 'better-auth',
      data: {
        id: 'auth-user-1',
        displayName: 'Canonical Name',
      },
    })
    expect(result.data.value).toEqual({
      id: 'auth-user-1',
      displayName: 'Canonical Name',
    })
    expect(result.status.value).toBe('success')
  })

  it('uses configured default subscribe:false when no per-call subscribe option is passed', async () => {
    const viewer = mockFnRef<'query'>('users:viewer-default-subscribe')
    const fetchMock = vi.fn(async () => ({
      value: { id: 'auth-user-defaults', displayName: 'Configured Default' },
    }))
    vi.stubGlobal('$fetch', fetchMock)

    const { result } = await captureInNuxt(
      () => {
        const identity = useState<AuthIdentity>('convex:identity')
        const pending = useState<boolean>('convex:pending')

        identity.value = toAuthenticatedIdentity('jwt.token', {
          id: 'auth-user-defaults',
          name: 'Session Name',
          email: 'session@example.com',
        })
        pending.value = false

        return useConvexUser(viewer, {})
      },
      { convexConfig: { defaults: { subscribe: false } } },
    )

    await waitFor(() => result.source.value === 'better-auth')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.data.value).toEqual({
      id: 'auth-user-defaults',
      displayName: 'Configured Default',
    })
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
      const identity = useState<AuthIdentity>('convex:identity')
      const pending = useState<boolean>('convex:pending')

      identity.value = toAuthenticatedIdentity('jwt.token', {
        id: 'auth-user-2',
        name: 'Session Name',
        email: 'session@example.com',
      })
      pending.value = false

      return useConvexUser(profile, {}, { source: 'projection', subscribe: false })
    })

    await waitFor(() => result.source.value === 'projection')
    expect(result.state.value).toEqual({
      source: 'projection',
      data: { authId: 'auth-user-2', handle: 'canonical' },
    })
    expect(result.data.value).toEqual({ authId: 'auth-user-2', handle: 'canonical' })
  })

  it('skips canonical user query while signed out', async () => {
    const viewer = mockFnRef<'query'>('users:viewer')
    const fetchMock = vi.fn()
    vi.stubGlobal('$fetch', fetchMock)

    const { result } = await captureInNuxt(() => {
      const identity = useState<AuthIdentity>('convex:identity')
      const pending = useState<boolean>('convex:pending')

      identity.value = ANONYMOUS_IDENTITY
      pending.value = false

      return useConvexUser(viewer, {}, { subscribe: false })
    })

    expect(result.data.value).toBeNull()
    expect(result.source.value).toBe('none')
    expect(result.state.value).toEqual({ source: 'none', data: null })
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
      const identity = useState<AuthIdentity>('convex:identity')
      const pending = useState<boolean>('convex:pending')

      identity.value = toAuthenticatedIdentity('jwt.token', {
        id: 'auth-user-3',
        name: 'Session Name',
        email: 'session@example.com',
      })
      pending.value = false

      return {
        identity,
        currentUser: useConvexUser(viewer, {}, { subscribe: false }),
      }
    })

    await waitFor(() => Boolean(resolveFetch))

    result.identity.value = ANONYMOUS_IDENTITY
    resolveFetch?.({ value: { id: 'auth-user-3', displayName: 'Late Result' } })

    await Promise.resolve()

    expect(result.currentUser.data.value).toBeNull()
    expect(result.currentUser.source.value).toBe('none')
    expect(result.currentUser.state.value).toEqual({ source: 'none', data: null })
    expect(result.currentUser.status.value).toBe('idle')
  })
})
