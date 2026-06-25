export type ConvexQueryAuthMode = 'auto' | 'none'

export type QueryExecutionPendingReason =
  | 'none'
  | 'explicit-skip'
  | 'auth-pending'
  | 'auth-signed-out'

export interface QueryExecutionGateInput {
  authEnabled: boolean
  authMode: ConvexQueryAuthMode
  authPending: boolean
  hasAuthToken: boolean
  isClient: boolean
  skipped: boolean
  subscribe: boolean
}

export interface QueryExecutionGate {
  pendingReason: QueryExecutionPendingReason
  resolveAsIdle: boolean
  setupLiveSubscription: boolean
  waitForAuth: boolean
}

export function createQueryExecutionGate(input: QueryExecutionGateInput): QueryExecutionGate {
  if (input.skipped) {
    return {
      pendingReason: 'explicit-skip',
      resolveAsIdle: true,
      setupLiveSubscription: false,
      waitForAuth: false,
    }
  }

  const waitForAuth =
    input.isClient && input.authEnabled && input.authMode !== 'none' && input.authPending

  if (waitForAuth) {
    return {
      pendingReason: 'auth-pending',
      resolveAsIdle: true,
      setupLiveSubscription: false,
      waitForAuth: true,
    }
  }

  const signedOutPrivateQuery =
    input.isClient && input.authEnabled && input.authMode !== 'none' && !input.hasAuthToken

  if (signedOutPrivateQuery) {
    return {
      pendingReason: 'auth-signed-out',
      resolveAsIdle: true,
      setupLiveSubscription: false,
      waitForAuth: false,
    }
  }

  return {
    pendingReason: 'none',
    resolveAsIdle: false,
    setupLiveSubscription: input.subscribe,
    waitForAuth: false,
  }
}
