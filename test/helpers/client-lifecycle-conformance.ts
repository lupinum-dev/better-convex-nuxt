export interface ClientLifecycleConformanceReport {
  beforeIdentityChange: {
    query: string[]
    pagination: string[]
    mutation: string
    action: string
  }
  afterIdentityChange: {
    query: null
    pagination: []
    mutationStatus: 'idle'
    actionStatus: 'idle'
  }
  afterDispose: {
    query: null
    activeQuerySubscriptions: 0
    activePaginationSubscriptions: 0
    identityListeners: 0
  }
}

export const EXPECTED_CLIENT_LIFECYCLE_REPORT: ClientLifecycleConformanceReport = {
  beforeIdentityChange: {
    query: ['query-a'],
    pagination: ['page-a', 'page-b'],
    mutation: 'mutation:user:alice:write',
    action: 'action:user:alice:work',
  },
  afterIdentityChange: {
    query: null,
    pagination: [],
    mutationStatus: 'idle',
    actionStatus: 'idle',
  },
  afterDispose: {
    query: null,
    activeQuerySubscriptions: 0,
    activePaginationSubscriptions: 0,
    identityListeners: 0,
  },
}
