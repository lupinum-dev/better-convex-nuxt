export const DEFAULT_SERVER_FETCH_TIMEOUT_MS = 8_000

interface FetchWithTimeoutOptions extends RequestInit {
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

function createTimeoutSignal(
  timeoutMs: number,
  parentSignal?: AbortSignal,
): {
  signal: AbortSignal
  cleanup: () => void
} {
  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort(new Error(`Request timed out after ${timeoutMs}ms`))
  }, timeoutMs)

  const abortFromParent = () => controller.abort(parentSignal?.reason)
  if (parentSignal) {
    if (parentSignal.aborted) {
      abortFromParent()
    } else {
      parentSignal.addEventListener('abort', abortFromParent, { once: true })
    }
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout)
      if (parentSignal) {
        parentSignal.removeEventListener('abort', abortFromParent)
      }
    },
  }
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  options: FetchWithTimeoutOptions = {},
): Promise<Response> {
  const {
    timeoutMs = DEFAULT_SERVER_FETCH_TIMEOUT_MS,
    fetchImpl = fetch,
    signal: parentSignal,
    ...init
  } = options

  const { signal, cleanup } = createTimeoutSignal(timeoutMs, parentSignal ?? undefined)
  try {
    return await fetchImpl(input, {
      ...init,
      signal,
    })
  } finally {
    cleanup()
  }
}
