import {
  useConvexConnectionState as useConvexConnectionStateRuntime,
  type ConnectionState,
} from './internal/connection-runtime.js'

export type { ConnectionState }

export function useConvexConnectionState() {
  return useConvexConnectionStateRuntime()
}
