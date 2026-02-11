/**
 * Registry for tracking auth proxy requests in dev mode.
 * This runs on the Nitro server and stores request data in global state.
 *
 * WARNING: This module uses globalThis state which IS shared across SSR requests.
 * This is acceptable because:
 * 1. It's only used in development mode for debugging
 * 2. It only stores non-sensitive timing/stats data
 * 3. The data is intentionally aggregated across requests for the DevTools panel
 *
 * Do NOT use this pattern for user-specific data in production.
 */
import type { AuthProxyRequest, AuthProxyStats } from './types'

// Development-only guard: This registry is only useful during development
// and should never be bundled into production code.
if (!import.meta.dev) {
  throw new Error(
    '[better-convex-nuxt] auth-proxy-registry is only available in development mode.',
  )
}

const MAX_REQUESTS = 20

// Use globalThis to persist across HMR in dev mode
// NOTE: This is intentionally shared state for dev-mode debugging.
declare global {
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
