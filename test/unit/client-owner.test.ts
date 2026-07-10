import type { ConnectionState } from 'convex/browser'
import { describe, expect, it, vi } from 'vitest'

import type { AuthIdentityPort, AuthIdentitySnapshot } from '../../src/runtime/auth/identity-port'
import {
  createConvexClientOwner,
  type OwnedConvexClient,
} from '../../src/runtime/client/client-owner'
import { IDENTITY_CHANGED } from '../../src/runtime/client/identity-changed-error'
import { MockConvexClient, mockFnRef } from '../helpers/mock-convex-client'

/**
 * A counting ConvexClient double for the owner's lifecycle invariants (internal
 * §17.2 "count effects, not only visible outcomes"). It records close() calls,
 * onUpdate subscribe/unsubscribe counts, and exposes controllable mutation
 * settlement so we can hold a mutation in flight across a replacement.
 */
class CountingClient extends MockConvexClient {
  static created = 0
  static closed = 0
  readonly ordinal: number
  closeCalls = 0

  constructor() {
    super()
    CountingClient.created += 1
    this.ordinal = CountingClient.created
  }

  close = async (): Promise<void> => {
    this.closeCalls += 1
    CountingClient.closed += 1
    // A real retired client never settles its in-flight mutation; mirror that by
    // resolving close() while leaving any pending mutation promise hanging.
    return Promise.resolve()
  }

  /** A mutation that never settles — models a mutation in flight across close(). */
  hangingMutation() {
    return new Promise<string>(() => {})
  }
}

function owner(withAnonymous = true) {
  return createConvexClientOwner({
    primaryFactory: () => new CountingClient() as unknown as OwnedConvexClient,
    ...(withAnonymous
      ? {
          anonymousFactory: () => new CountingClient() as unknown as OwnedConvexClient,
        }
      : {}),
  })
}

function resetCounts() {
  CountingClient.created = 0
  CountingClient.closed = 0
}

/** Minimal fake auth port emitting identity-generation transitions on demand. */
function fakePort(initial: Partial<AuthIdentitySnapshot> = {}) {
  let snap: AuthIdentitySnapshot = {
    authEnabled: true,
    settled: true,
    identityKey: 'anonymous',
    authEpoch: 0,
    identityGeneration: 0,
    error: null,
    ...initial,
  }
  const listeners = new Set<() => void>()
  const initializePrimary = vi.fn(async () => {})
  const port: AuthIdentityPort = {
    snapshot: () => snap,
    waitForInitialSettlement: () => Promise.resolve(),
    subscribe: (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    initializePrimary,
  }
  const emit = (next: Partial<AuthIdentitySnapshot>) => {
    snap = { ...snap, ...next }
    for (const l of [...listeners]) l()
  }
  return { port, emit, initializePrimary, current: () => snap }
}

describe('createConvexClientOwner', () => {
  it('creates one primary eagerly and exposes a stable handle', () => {
    resetCounts()
    const o = owner()
    expect(CountingClient.created).toBe(1) // anonymous is lazy, not created yet
    const primary = o.getPrimary()
    expect(primary?.identityGeneration).toBe(0)
    // Handle identity is stable across reads.
    expect(o.handle.query).toBe(o.handle.query)
  })

  it('creates the anonymous client lazily and reuses it', () => {
    resetCounts()
    const o = owner()
    expect(CountingClient.created).toBe(1)
    const a1 = o.getAnonymous()
    expect(CountingClient.created).toBe(2)
    const a2 = o.getAnonymous()
    expect(a2).toBe(a1)
    expect(CountingClient.created).toBe(2)
  })

  it('reuses the primary for anonymous transport when no anonymousFactory is given (auth-disabled)', () => {
    resetCounts()
    const o = owner(false)
    expect(o.getAnonymous()).toBe(o.getPrimary()!.client)
    expect(CountingClient.created).toBe(1)
  })

  describe('replacePrimary', () => {
    it('creates B, publishes it, closes A, and advances the generation (create/close balance)', async () => {
      resetCounts()
      const o = owner()
      const a = o.getPrimary()!.client as unknown as CountingClient
      await o.replacePrimary({
        identity: 'user:alice',
        authEpoch: 1,
        identityGeneration: 1,
        isCurrent: () => true,
        initialize: async () => {},
      })
      const b = o.getPrimary()!.client as unknown as CountingClient
      expect(b).not.toBe(a)
      expect(o.getPrimary()!.identityGeneration).toBe(1)
      expect(a.closeCalls).toBe(1) // A retired exactly once
      expect(b.closeCalls).toBe(0)
      expect(CountingClient.created).toBe(2) // A + B, no anonymous
    })

    it('rejects an in-flight consumer-held mutation with IDENTITY_CHANGED on retirement', async () => {
      resetCounts()
      const o = owner()
      const a = o.getPrimary()!.client as unknown as CountingClient
      a.setMutationHandler('m', () => a.hangingMutation())

      const inflight = o.handle.mutation(mockFnRef<'mutation'>('m'), {})
      const assertion = expect(inflight).rejects.toMatchObject({
        code: IDENTITY_CHANGED,
      })

      await o.replacePrimary({
        identity: 'user:alice',
        authEpoch: 1,
        identityGeneration: 1,
        isCurrent: () => true,
        initialize: async () => {},
      })
      await assertion
    })

    it('closes the candidate when initialize() rejects, keeps the previous primary, and rethrows (no orphaned WebSocket)', async () => {
      resetCounts()
      const o = owner()
      const a = o.getPrimary()!.client as unknown as CountingClient
      const failure = new Error('confirmation failed')

      await expect(
        o.replacePrimary({
          identity: 'user:alice',
          authEpoch: 1,
          identityGeneration: 1,
          isCurrent: () => true,
          initialize: async () => {
            throw failure
          },
        }),
      ).rejects.toBe(failure)

      // Owner still on the previous primary; generation unchanged.
      expect(o.getPrimary()!.client).toBe(a as unknown as OwnedConvexClient)
      expect(o.getPrimary()!.identityGeneration).toBe(0)

      // create/close balance: A (still open) + candidate B (created then closed).
      expect(CountingClient.created).toBe(2)
      expect(CountingClient.closed).toBe(1)
      expect(a.closeCalls).toBe(0)

      // Dispose still exits clean afterward.
      await o.dispose()
      expect(CountingClient.closed).toBe(2) // A closes on dispose; B stays closed once
    })

    it('a stale candidate (isCurrent=false) is closed and never published', async () => {
      resetCounts()
      const o = owner()
      const a = o.getPrimary()!.client as unknown as CountingClient
      const result = await o.replacePrimary({
        identity: 'user:alice',
        authEpoch: 1,
        identityGeneration: 1,
        isCurrent: () => false, // superseded before commit
        initialize: async () => {},
      })
      expect(result).toBe(a) // previous stays current
      expect(o.getPrimary()!.client).toBe(a as unknown as OwnedConvexClient)
      expect(o.getPrimary()!.identityGeneration).toBe(0) // generation NOT advanced
      const candidate = result as unknown as CountingClient
      void candidate
      // A remained; the candidate (ordinal 2) was closed.
      expect(CountingClient.created).toBe(2)
      expect(CountingClient.closed).toBe(1)
      expect(a.closeCalls).toBe(0)
    })
  })

  describe('onUpdate rebinding (proof 11 mechanics)', () => {
    it('rebinds active listeners A→B with a stable unsubscribe and exactly one live subscription', async () => {
      resetCounts()
      const o = owner()
      const a = o.getPrimary()!.client as unknown as CountingClient
      const cb = vi.fn()
      const unsubscribe = o.handle.onUpdate(mockFnRef<'query'>('q'), {}, cb)

      expect(a.activeListenerCount()).toBe(1)

      await o.replacePrimary({
        identity: 'user:alice',
        authEpoch: 1,
        identityGeneration: 1,
        isCurrent: () => true,
        initialize: async () => {},
      })
      const b = o.getPrimary()!.client as unknown as CountingClient

      // Detached from A, reattached to B — exactly one live subscription total.
      expect(a.activeListenerCount()).toBe(0)
      expect(b.activeListenerCount()).toBe(1)

      // The unsubscribe identity is stable and removes the CURRENT (B) subscription.
      unsubscribe()
      expect(b.activeListenerCount()).toBe(0)
      // Idempotent.
      unsubscribe()
      expect(b.activeListenerCount()).toBe(0)
    })

    it('a B-side emission still reaches the original callback after rebinding', async () => {
      resetCounts()
      const o = owner()
      const cb = vi.fn()
      o.handle.onUpdate(mockFnRef<'query'>('q'), {}, cb)
      await o.replacePrimary({
        identity: 'user:alice',
        authEpoch: 1,
        identityGeneration: 1,
        isCurrent: () => true,
        initialize: async () => {},
      })
      const b = o.getPrimary()!.client as unknown as CountingClient
      b.emitQueryResultByPath('q', 42)
      expect(cb).toHaveBeenCalledWith(42)
    })
  })

  describe('handle dispatch generation guard', () => {
    it('resolves normally when the generation is unchanged', async () => {
      resetCounts()
      const o = owner()
      const a = o.getPrimary()!.client as unknown as CountingClient
      a.setQueryHandler('q', () => 'ok')
      await expect(o.handle.query(mockFnRef<'query'>('q'), {})).resolves.toBe('ok')
    })

    it('does not reject same-user rotation (no replacement, generation stable)', async () => {
      resetCounts()
      const { port, emit } = fakePort()
      const o = owner()
      o.attachAuthPort(port)
      const a = o.getPrimary()!.client as unknown as CountingClient
      a.setQueryHandler('q', () => 'ok')
      // Same-user token rotation: epoch bumps, generation unchanged.
      emit({ authEpoch: 1 })
      await Promise.resolve()
      expect(o.getPrimary()!.client).toBe(a as unknown as OwnedConvexClient)
      expect(CountingClient.created).toBe(1) // no replacement client created
    })
  })

  describe('attachAuthPort reactive replacement', () => {
    it('replaces the primary exactly on identityGeneration changes, not epoch-only changes', async () => {
      resetCounts()
      const { port, emit, initializePrimary } = fakePort()
      const o = owner()
      o.attachAuthPort(port)

      // epoch-only change → no replacement
      emit({ authEpoch: 1 })
      await Promise.resolve()
      expect(CountingClient.created).toBe(1)
      expect(initializePrimary).not.toHaveBeenCalled()

      // identity change → replacement
      emit({ identityGeneration: 1, authEpoch: 2, identityKey: 'user:alice' })
      await Promise.resolve()
      await Promise.resolve()
      expect(initializePrimary).toHaveBeenCalledTimes(1)
      expect(CountingClient.created).toBe(2)
      expect(o.getPrimary()!.identityGeneration).toBe(1)
    })
  })

  describe('connection-state store', () => {
    it('subscribes on first consumer, unsubscribes on last', () => {
      resetCounts()
      const o = owner()
      const a = o.getPrimary()!.client as unknown as CountingClient
      expect(a.connectionSubscriberCount()).toBe(0)
      const r1 = o.connection.addConsumer()
      const r2 = o.connection.addConsumer()
      expect(a.connectionSubscriberCount()).toBe(1) // single underlying subscription
      r1()
      expect(a.connectionSubscriberCount()).toBe(1)
      r2()
      expect(a.connectionSubscriberCount()).toBe(0)
    })

    it('resets to default and rebinds to the replacement on primary replacement', async () => {
      resetCounts()
      const o = owner()
      const a = o.getPrimary()!.client as unknown as CountingClient
      o.connection.addConsumer()
      a.updateConnectionState({
        isWebSocketConnected: true,
        connectionCount: 3,
      })
      expect((o.connection.state.value as ConnectionState).isWebSocketConnected).toBe(true)

      await o.replacePrimary({
        identity: 'user:alice',
        authEpoch: 1,
        identityGeneration: 1,
        isCurrent: () => true,
        initialize: async () => {},
      })
      const b = o.getPrimary()!.client as unknown as CountingClient

      // Synchronously reset; old subscription dropped; rebound to B (has consumer).
      expect(a.connectionSubscriberCount()).toBe(0)
      expect(b.connectionSubscriberCount()).toBe(1)
      // B starts at its default (disconnected) snapshot.
      expect((o.connection.state.value as ConnectionState).connectionCount).toBe(0)
    })
  })

  describe('dispose', () => {
    it('closes every allocated client and is idempotent (create/close balance)', async () => {
      resetCounts()
      const o = owner()
      o.getAnonymous() // force the anonymous client to exist
      expect(CountingClient.created).toBe(2)

      await o.dispose()
      expect(CountingClient.closed).toBe(2) // primary + anonymous both closed
      // Idempotent: second dispose does not double-close.
      await o.dispose()
      expect(CountingClient.closed).toBe(2)
    })

    it('rejects in-flight consumer calls with IDENTITY_CHANGED on dispose', async () => {
      resetCounts()
      const o = owner()
      const a = o.getPrimary()!.client as unknown as CountingClient
      a.setMutationHandler('m', () => a.hangingMutation())
      const inflight = o.handle.mutation(mockFnRef<'mutation'>('m'), {})
      const assertion = expect(inflight).rejects.toMatchObject({
        code: IDENTITY_CHANGED,
      })
      // Let dispatch resolve its primary and register the pending call before we
      // tear the owner down.
      await Promise.resolve()
      await o.dispose()
      await assertion
    })

    it('returns all live client counts to zero after disposal', async () => {
      resetCounts()
      const o = owner()
      o.getAnonymous()
      await o.replacePrimary({
        identity: 'user:alice',
        authEpoch: 1,
        identityGeneration: 1,
        isCurrent: () => true,
        initialize: async () => {},
      })
      // created: primary A + anonymous + replacement B = 3; A already closed on replace.
      expect(CountingClient.created).toBe(3)
      expect(CountingClient.closed).toBe(1)
      await o.dispose()
      // B + anonymous close on dispose → all 3 closed.
      expect(CountingClient.closed).toBe(3)
    })
  })
})
