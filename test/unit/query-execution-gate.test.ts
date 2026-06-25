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

  it('does not pause server-side execution', () => {
    expect(
      createQueryExecutionGate({
        authEnabled: true,
        authMode: 'auto',
        authPending: true,
        hasAuthToken: false,
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
