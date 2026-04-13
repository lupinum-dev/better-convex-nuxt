import type { AuthProxyRequest, AuthProxyStats } from './types.js'

const MAX_REQUESTS = 20
const STORAGE_NAMESPACE = 'devtools:convex:auth-proxy'
const STORAGE_KEY = 'requests'

interface RuntimeStorage {
  getItem<T>(key: string): Promise<T | null>
  setItem<T>(key: string, value: T): Promise<void>
}

async function getStorage() {
  const runtime = await import('nitropack/runtime').catch(() => null)
  const useStorage = (runtime as { useStorage?: (namespace: string) => RuntimeStorage } | null)
    ?.useStorage
  if (typeof useStorage !== 'function') {
    return null
  }
  return useStorage(STORAGE_NAMESPACE)
}

async function getRequests(): Promise<AuthProxyRequest[]> {
  const storage = await getStorage()
  if (!storage) return []
  const requests = await storage.getItem<AuthProxyRequest[]>(STORAGE_KEY)
  return Array.isArray(requests) ? requests : []
}

async function setRequests(requests: AuthProxyRequest[]): Promise<void> {
  const storage = await getStorage()
  if (!storage) return
  await storage.setItem(STORAGE_KEY, requests)
}

export async function recordAuthProxyRequest(request: AuthProxyRequest): Promise<void> {
  const requests = await getRequests()
  requests.unshift(request)
  if (requests.length > MAX_REQUESTS) {
    requests.length = MAX_REQUESTS
  }
  await setRequests(requests)
}

export async function getAuthProxyStats(): Promise<AuthProxyStats> {
  const requests = await getRequests()
  const successful = requests.filter((r) => r.success)
  const durations = successful
    .filter((r): r is typeof r & { duration: number } => r.duration !== undefined)
    .map((r) => r.duration)

  return {
    totalRequests: requests.length,
    successCount: successful.length,
    errorCount: requests.filter((r) => !r.success).length,
    avgDuration:
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0,
    recentRequests: [...requests],
  }
}

export async function clearAuthProxyStats(): Promise<void> {
  await setRequests([])
}
