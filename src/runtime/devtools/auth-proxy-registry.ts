/**
 * Registry for tracking auth proxy requests in dev mode.
 * This runs on the Nitro server and stores request data in global state.
 */
import type { AuthProxyRequest, AuthProxyStats } from './types'

const MAX_REQUESTS = 20

// Use globalThis to persist across HMR in dev mode
declare global {
  // eslint-disable-next-line no-var
  var __convex_auth_proxy_requests__: AuthProxyRequest[] | undefined
}

function getRequests(): AuthProxyRequest[] {
  if (!globalThis.__convex_auth_proxy_requests__) {
    globalThis.__convex_auth_proxy_requests__ = []
  }
  return globalThis.__convex_auth_proxy_requests__
}

export function recordAuthProxyRequest(request: AuthProxyRequest): void {
  const requests = getRequests()
  requests.unshift(request)
  if (requests.length > MAX_REQUESTS) {
    requests.pop()
  }
}

export function getAuthProxyStats(): AuthProxyStats {
  const requests = getRequests()
  const successful = requests.filter(r => r.success)
  const durations = successful.filter(r => r.duration !== undefined).map(r => r.duration!)

  return {
    totalRequests: requests.length,
    successCount: successful.length,
    errorCount: requests.filter(r => !r.success).length,
    avgDuration: durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0,
    recentRequests: [...requests],
  }
}

export function clearAuthProxyStats(): void {
  globalThis.__convex_auth_proxy_requests__ = []
}
