import { getHeader } from 'h3'
import { useEvent, useStorage } from 'nitropack/runtime'
import type { Storage, StorageValue } from 'unstorage'

export interface McpSessionStore<T = Record<string, unknown>> {
  sessionId: string
  namespace: string
  get<K extends keyof T & string>(key: K): Promise<T[K] | null>
  set<K extends keyof T & string>(key: K, value: T[K]): Promise<void>
  remove<K extends keyof T & string>(key: K): Promise<void>
  has<K extends keyof T & string>(key: K): Promise<boolean>
  keys(): Promise<string[]>
  clear(): Promise<void>
  storage: Storage
}

function sanitizeNamespace(value: string): string {
  return (
    value
      .replace(/[^\w:/-]+/g, '-')
      .replace(/\/+/g, '/')
      .replace(/^-+|-+$/g, '') || 'mcp'
  )
}

export function useMcpSession<T = Record<string, unknown>>(): McpSessionStore<T> {
  const event = useEvent()
  const sessionId = getHeader(event, 'mcp-session-id')

  if (!sessionId) {
    throw new Error(
      'No active MCP session. Ensure `mcp.sessions` is enabled and `nitro.experimental.asyncContext` is true.',
    )
  }

  const routeNamespace = sanitizeNamespace(event.path || event.node.req.url || 'mcp')
  const storage = useStorage(`mcp:sessions:${routeNamespace}:${sessionId}`)

  return {
    sessionId,
    namespace: routeNamespace,
    get: async (key) => (await storage.getItem(key)) as T[typeof key] | null,
    set: (key, value) => storage.setItem(key, value as StorageValue),
    remove: (key) => storage.removeItem(key),
    has: (key) => storage.hasItem(key),
    keys: () => storage.getKeys(),
    clear: () => storage.clear(),
    storage,
  }
}
