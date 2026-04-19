export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

export function sanitizeBodyPreview(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 240)
}

export async function waitForHttpReady(
  url: string,
  timeoutMs: number,
  options: {
    expectedStatus?: number
    intervalMs?: number
  } = {},
): Promise<void> {
  const startedAt = Date.now()
  const expectedStatus = options.expectedStatus ?? 200
  const intervalMs = options.intervalMs ?? 100

  while (Date.now() - startedAt <= timeoutMs) {
    try {
      const response = await fetchWithTimeout(url, { method: 'GET' }, Math.min(timeoutMs, 1_000))
      if (response.status === expectedStatus) {
        return
      }
    } catch {
      // Retry until the server is actually ready.
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  throw new Error(`Timed out waiting for HTTP readiness at ${url}`)
}
