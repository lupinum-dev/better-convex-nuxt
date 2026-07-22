interface MockStats {
  clients: number
  closed: number
  setAuth: number
  clearAuth: number
  tokenFetches: number
}

const stats: MockStats = {
  clients: 0,
  closed: 0,
  setAuth: 0,
  clearAuth: 0,
  tokenFetches: 0,
}
let currentAuthChange: ((authenticated: boolean) => void) | null = null

export function readMockStats(): MockStats {
  return { ...stats }
}

export function rejectCurrentCredential(): void {
  currentAuthChange?.(false)
}

export class ConvexClient {
  constructor(_url: string, _options: unknown) {
    stats.clients += 1
  }

  setAuth(
    fetchToken: () => Promise<string | null>,
    onChange: (authenticated: boolean) => void,
  ): void {
    stats.setAuth += 1
    currentAuthChange = onChange
    void fetchToken().then((token) => {
      stats.tokenFetches += 1
      queueMicrotask(() => onChange(typeof token === 'string' && token.length > 0))
    })
  }

  clearAuth(): void {
    stats.clearAuth += 1
    currentAuthChange = null
  }

  query = async () => null
  mutation = async () => null
  action = async () => null
  onUpdate = () => () => {}
  connectionState = () => ({
    hasInflightRequests: false,
    isWebSocketConnected: true,
    timeOfOldestInflightRequest: null,
    hasEverConnected: true,
    connectionCount: 1,
    connectionRetries: 0,
    inflightMutations: 0,
    inflightActions: 0,
  })
  subscribeToConnectionState = () => () => {}

  async close(): Promise<void> {
    stats.closed += 1
  }
}
