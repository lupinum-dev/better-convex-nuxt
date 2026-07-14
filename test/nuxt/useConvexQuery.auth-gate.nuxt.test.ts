import { afterEach, describe, expect, it, vi } from 'vitest'

import { useState } from '#imports'

import {
  ANONYMOUS_IDENTITY,
  LOADING_IDENTITY,
  toAuthenticatedIdentity,
  type AuthIdentity,
} from '../../src/runtime/auth/auth-identity'
import { createConvexQueryState } from '../../src/runtime/composables/useConvexQuery'
import { makeMockOwner } from '../helpers/mock-client-owner'
import { MockConvexClient, mockFnRef } from '../helpers/mock-convex-client'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'

afterEach(() => {
  vi.clearAllMocks()
})

// vNext §6 execution-gate behavior driven by canonical auth status + mode.
describe('useConvexQuery auth execution gate', () => {
  it('keeps the returned promise pending until auth settles and the query completes', async () => {
    const primary = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:await-auth')
    primary.setQueryHandler('notes:await-auth', async () => ({ owner: 'u1' }))

    const { result, flush } = await captureInNuxt(
      () => {
        const pending = useState<boolean>('convex:pending', () => true)
        const identity = useState<AuthIdentity>('convex:identity')
        pending.value = true
        identity.value = LOADING_IDENTITY
        const state = createConvexQueryState(query, {}, { auth: 'required', subscribe: false })
        return { state, pending, identity }
      },
      { owner: makeMockOwner(primary) },
    )

    let resolved = false
    void result.state.resolvePromise.then(() => {
      resolved = true
    })
    await Promise.resolve()
    expect(resolved).toBe(false)
    expect(result.state.resultData.status.value).toBe('pending')

    result.identity.value = toAuthenticatedIdentity('jwt-u1', { id: 'u1' })
    result.pending.value = false
    await flush()
    await result.state.resolvePromise
    expect(resolved).toBe(true)
    expect(primary.calls.query.length).toBeGreaterThan(0)
    expect(result.state.resultData.status.value).not.toBe('pending')
  })

  it('required waits while auth is loading, then subscribes with the signed-in identity', async () => {
    const primary = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:required')

    const { result, flush } = await captureInNuxt(
      () => {
        const pending = useState<boolean>('convex:pending', () => true)
        const identity = useState<AuthIdentity>('convex:identity')
        // Reset shared auth state (leaks across tests via one app's useState).
        pending.value = true
        identity.value = LOADING_IDENTITY
        const q = createConvexQueryState(query, {}, { auth: 'required' }, true).resultData
        return { q, pending, identity }
      },
      { owner: makeMockOwner(primary) },
    )

    // Loading: no network request.
    await flush()
    expect(primary.calls.onUpdate.length).toBe(0)

    // Settles authenticated: executes with identity.
    result.identity.value = toAuthenticatedIdentity('jwt-u1', { id: 'u1' })
    result.pending.value = false
    await flush()
    expect(primary.activeListenerCount(query, {})).toBe(1)
  })

  it('required stays idle when auth settles anonymous', async () => {
    const primary = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:required-anon')

    const { result, flush } = await captureInNuxt(
      () => {
        const pending = useState<boolean>('convex:pending', () => true)
        const identity = useState<AuthIdentity>('convex:identity')
        // Reset shared auth state (leaks across tests via one app's useState).
        pending.value = true
        identity.value = LOADING_IDENTITY
        const q = createConvexQueryState(query, {}, { auth: 'required' }, true).resultData
        return { q, pending, identity }
      },
      { owner: makeMockOwner(primary) },
    )

    result.identity.value = ANONYMOUS_IDENTITY
    result.pending.value = false
    await flush()

    expect(primary.calls.onUpdate.length).toBe(0)
    expect(result.q.status.value).toBe('idle')
  })

  it('optional executes anonymously when auth settles anonymous', async () => {
    const primary = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:optional-anon')

    const { result, flush } = await captureInNuxt(
      () => {
        const pending = useState<boolean>('convex:pending', () => true)
        const identity = useState<AuthIdentity>('convex:identity')
        // Reset shared auth state (leaks across tests via one app's useState).
        pending.value = true
        identity.value = LOADING_IDENTITY
        const q = createConvexQueryState(query, {}, { auth: 'optional' }, true).resultData
        return { q, pending, identity }
      },
      { owner: makeMockOwner(primary) },
    )

    result.identity.value = ANONYMOUS_IDENTITY
    result.pending.value = false
    await flush()

    // optional executes on the primary (currently anonymous) — not the dedicated
    // none client.
    expect(primary.activeListenerCount(query, {})).toBe(1)
  })

  it('auth-disabled build: required stays idle, optional executes without waiting', async () => {
    const requiredClient = new MockConvexClient()
    const optionalClient = new MockConvexClient()
    const requiredQuery = mockFnRef<'query'>('notes:disabled-required')
    const optionalQuery = mockFnRef<'query'>('notes:disabled-optional')

    const required = await captureInNuxt(
      () => createConvexQueryState(requiredQuery, {}, { auth: 'required' }, true).resultData,
      { owner: makeMockOwner(requiredClient), convexConfig: { auth: false } },
    )
    await required.flush()
    expect(requiredClient.calls.onUpdate.length).toBe(0)
    expect(required.result.status.value).toBe('idle')

    const optional = await captureInNuxt(
      () => createConvexQueryState(optionalQuery, {}, { auth: 'optional' }, true).resultData,
      { owner: makeMockOwner(optionalClient), convexConfig: { auth: false } },
    )
    await optional.flush()
    expect(optionalClient.activeListenerCount(optionalQuery, {})).toBe(1)
  })
})
