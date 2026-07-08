import { describe, expect, it } from 'vitest'

import { createQueryExecutionGate } from '../../src/runtime/utils/query-execution-gate'

describe('createQueryExecutionGate', () => {
  it('treats explicit skip as idle without waiting for auth', () => {
    expect(
      createQueryExecutionGate({
        authEnabled: true,
        authMode: 'auto',
        authPending: true,
        hasAuthToken: false,
        isClient: true,
        skipped: true,
        subscribe: true,
      }),
    ).toEqual({
      pendingReason: 'explicit-skip',
      resolveAsIdle: true,
      setupLiveSubscription: false,
      waitForAuth: false,
    })
  })

  it('pauses private client queries while auth is pending', () => {
    expect(
      createQueryExecutionGate({
        authEnabled: true,
        authMode: 'auto',
        authPending: true,
        hasAuthToken: false,
        isClient: true,
        skipped: false,
        subscribe: true,
      }),
    ).toEqual({
      pendingReason: 'auth-pending',
      resolveAsIdle: true,
      setupLiveSubscription: false,
      waitForAuth: true,
    })
  })

  it('does not pause public auth:none queries', () => {
    expect(
      createQueryExecutionGate({
        authEnabled: true,
        authMode: 'none',
        authPending: true,
        hasAuthToken: false,
        isClient: true,
        skipped: false,
        subscribe: true,
      }),
    ).toEqual({
      pendingReason: 'none',
      resolveAsIdle: false,
      setupLiveSubscription: true,
      waitForAuth: false,
    })
  })

  it('does not pause server-side execution while auth is pending with a token', () => {
    expect(
      createQueryExecutionGate({
        authEnabled: true,
        authMode: 'auto',
        authPending: true,
        hasAuthToken: true,
        isClient: false,
        skipped: false,
        subscribe: true,
      }),
    ).toMatchObject({
      pendingReason: 'none',
      resolveAsIdle: false,
      setupLiveSubscription: true,
    })
  })

  it('resolves signed-out identically on server and client (SSR hydration parity)', () => {
    // Regression: the server used to proceed for a signed-out auth query
    // (baking a permanent "loading" state into SSR HTML) while the client
    // resolved idle -> hydration text/class mismatches on every signed-out
    // visit to a page with an auth:'auto' query.
    const base = {
      authEnabled: true,
      authMode: 'auto' as const,
      authPending: false,
      hasAuthToken: false,
      skipped: false,
      subscribe: true,
    }
    const serverGate = createQueryExecutionGate({ ...base, isClient: false })
    const clientGate = createQueryExecutionGate({ ...base, isClient: true })

    expect(serverGate).toMatchObject({ pendingReason: 'auth-signed-out', resolveAsIdle: true })
    expect(serverGate.pendingReason).toBe(clientGate.pendingReason)
    expect(serverGate.resolveAsIdle).toBe(clientGate.resolveAsIdle)
  })

  it('does not set up live subscriptions when subscribe is false', () => {
    expect(
      createQueryExecutionGate({
        authEnabled: true,
        authMode: 'auto',
        authPending: false,
        hasAuthToken: true,
        isClient: true,
        skipped: false,
        subscribe: false,
      }),
    ).toMatchObject({
      pendingReason: 'none',
      resolveAsIdle: false,
      setupLiveSubscription: false,
    })
  })

  it('idles signed-out private client queries', () => {
    expect(
      createQueryExecutionGate({
        authEnabled: true,
        authMode: 'auto',
        authPending: false,
        hasAuthToken: false,
        isClient: true,
        skipped: false,
        subscribe: true,
      }),
    ).toEqual({
      pendingReason: 'auth-signed-out',
      resolveAsIdle: true,
      setupLiveSubscription: false,
      waitForAuth: false,
    })
  })
})
