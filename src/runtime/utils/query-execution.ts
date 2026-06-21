import { parseConvexResponse } from './convex-cache'

/**
 * Execute query via HTTP on server or client without WebSocket state.
 *
 * @internal
 */
export async function executeQueryHttp<T>(
  convexUrl: string,
  functionPath: string,
  args: Record<string, unknown>,
  authToken?: string,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`
  }

  const response = await $fetch(`${convexUrl}/api/query`, {
    method: 'POST',
    headers,
    body: { path: functionPath, args: args ?? {} },
  })

  return parseConvexResponse<T>(response)
}
