import type { Storage } from 'unstorage'
import { getHeader } from 'h3'
import { useEvent, useStorage } from 'nitropack/runtime'

export interface McpSessionStore<T = Record<string, unknown>> {
  get<K extends keyof T & string>(key: K): Promise<T[K] | null>
  set<K extends keyof T & string>(key: K, value: T[K]): Promise<void>
  remove<K extends keyof T & string>(key: K): Promise<void>
  has<K extends keyof T & string>(key: K): Promise<boolean>
  keys(): Promise<string[]>
  clear(): Promise<void>
  storage: Storage
}

export function useMcpSession<T = Record<string, unknown>>(): McpSessionStore<T> {
  const event = useEvent()
  const sessionId = getHeader(event, 'mcp-session-id')

  if (!sessionId) {
    throw new Error(
      'No active MCP session. Ensure `mcp.sessions` is enabled and `nitro.experimental.asyncContext` is true.',
    )
  }

  const storage = useStorage(`mcp:sessions:${sessionId}`)

  return {
    get: key => storage.getItem(key),
    set: (key, value) => storage.setItem(key, value),
    remove: key => storage.removeItem(key),
    has: key => storage.hasItem(key),
    keys: () => storage.getKeys(),
    clear: () => storage.clear(),
    storage,
  }
}
