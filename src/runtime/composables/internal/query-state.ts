export interface ResolveQueryDefaultValueInput<RawT> {
  keepPreviousData: boolean
  lastSettledData: RawT | null
  fallback?: () => RawT | undefined
}

export interface PersistLastSettledQueryInput<RawT> {
  value: RawT | null
  pending: boolean
  argsHash: string | null
}

export interface QueryStaleStateInput {
  keepPreviousData: boolean
  isSkipped: boolean
  pending: boolean
  hasError: boolean
  currentArgsHash: string | null
  lastSettledArgsHash: string | null
  lastReceivedArgsHash: string | null
  hasData: boolean
}

export function createSkippedQueryCacheKey(functionName: string): string {
  return `convex:skipped:${functionName}`
}

export function resolveQueryDefaultValue<RawT>(
  input: ResolveQueryDefaultValueInput<RawT>,
): RawT | null {
  if (input.keepPreviousData && input.lastSettledData !== null) {
    return input.lastSettledData
  }
  const fallback = input.fallback?.()
  return fallback == null ? null : fallback
}

export function shouldPersistLastSettledQuery<RawT>(
  input: PersistLastSettledQueryInput<RawT>,
): boolean {
  return input.value != null && !input.pending && Boolean(input.argsHash)
}

export function shouldMarkQueryDataAsStale(input: QueryStaleStateInput): boolean {
  if (!input.keepPreviousData) return false
  if (input.isSkipped || !input.pending || input.hasError) return false
  if (!input.currentArgsHash || input.lastSettledArgsHash === null) return false
  if (input.lastSettledArgsHash === input.currentArgsHash) return false
  if (input.lastReceivedArgsHash === input.currentArgsHash) return false
  return input.hasData
}
