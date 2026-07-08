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

  // Signed-out is knowable on BOTH server and client: the server plugin
  // resolves the token before render, so `hasAuthToken` is authoritative on
  // either side. Resolving idle here keeps SSR HTML identical to the client's
  // first render (no hydration mismatch) and skips a server fetch that could
  // never succeed without a token anyway.
  const signedOutPrivateQuery =
    input.authEnabled && input.authMode !== 'none' && !input.hasAuthToken

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
