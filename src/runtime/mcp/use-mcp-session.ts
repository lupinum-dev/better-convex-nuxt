import { getHeader } from 'h3'
import { useEvent, useStorage } from 'nitropack/runtime'
import { hash } from 'ohash'
import type { Storage, StorageValue } from 'unstorage'

const UUID_V4_RE = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i
const MCP_SESSION_TTL_SECONDS = 24 * 60 * 60

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

function isValidSessionId(value: string): boolean {
  return UUID_V4_RE.test(value)
}

function resolveSessionCallerKey(event: { context?: Record<string, unknown> }): string {
  const auth = (event.context?.__trellisMcpAuth ?? event.context?.mcpAuth) as
    | {
        role?: string
        userId?: string
        workspaceId?: string
      }
    | undefined

  if (!auth?.userId) {
    return 'anonymous'
  }

  return hash({
    role: auth.role ?? null,
    workspaceId: auth.workspaceId ?? null,
    userId: auth.userId,
  })
}

export function useMcpSession<T = Record<string, unknown>>(): McpSessionStore<T> {
  const event = useEvent()
  const sessionId = getHeader(event, 'mcp-session-id')

  if (!sessionId) {
    throw new Error(
      'No active MCP session. Ensure `mcp.sessions` is enabled and `nitro.experimental.asyncContext` is true.',
    )
  }
  if (!isValidSessionId(sessionId)) {
    throw new Error('Invalid MCP session ID format')
  }

  const callerKey = resolveSessionCallerKey(event as { context?: Record<string, unknown> })
  const storage = useStorage(`mcp:sessions:${callerKey}:${sessionId}`)

  return {
    sessionId,
    namespace: 'mcp',
    get: async (key) => (await storage.getItem(key)) as T[typeof key] | null,
    set: (key, value) =>
      storage.setItem(key, value as StorageValue, { ttl: MCP_SESSION_TTL_SECONDS }),
    remove: (key) => storage.removeItem(key),
    has: (key) => storage.hasItem(key),
    keys: () => storage.getKeys(),
    clear: () => storage.clear(),
    storage,
  }
}
