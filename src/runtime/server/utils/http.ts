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
    const response = await fetchImpl(input, {
      ...init,
      signal,
    })
    if (!response.body) {
      cleanup()
      return response
    }
    const reader = response.body.getReader()
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const next = await reader.read()
          if (next.done) {
            cleanup()
            reader.releaseLock()
            controller.close()
          } else {
            controller.enqueue(next.value)
          }
        } catch (error) {
          cleanup()
          reader.releaseLock()
          controller.error(error)
        }
      },
      async cancel(reason) {
        cleanup()
        await reader.cancel(reason)
        reader.releaseLock()
      },
    })
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  } catch (error) {
    cleanup()
    throw error
  }
}
