import { ConvexClient } from 'convex/browser'

/**
 * Creates and returns the Convex WebSocket client.
 * Exposes `window.__convex_client__` in dev for debugging.
 */
export function initConvexClient(url: string): ConvexClient {
  const client = new ConvexClient(url)

  if (typeof window !== 'undefined' && import.meta.dev) {
    ;(window as unknown as Record<string, unknown>).__convex_client__ = client
  }

  return client
}
