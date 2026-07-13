import { describe, expect, it, vi } from 'vitest'

import { fetchWithTimeout } from '../../src/runtime/server/utils/http'

describe('server fetch deadline', () => {
  it('remains active after response headers until the body settles', async () => {
    vi.useFakeTimers()
    try {
      let signal: AbortSignal | undefined
      const response = await fetchWithTimeout('https://upstream.example', {
        timeoutMs: 50,
        fetchImpl: async (_input, init) => {
          signal = init?.signal ?? undefined
          return new Response(new ReadableStream({ start() {} }))
        },
      })
      expect(signal?.aborted).toBe(false)
      await vi.advanceTimersByTimeAsync(51)
      expect(signal?.aborted).toBe(true)
      await response.body?.cancel()
    } finally {
      vi.useRealTimers()
    }
  })
})
