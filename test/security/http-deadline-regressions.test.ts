import { describe, expect, it, vi } from 'vitest'

import { fetchWithTimeout } from '../../src/runtime/server/utils/http'

describe('server fetch deadline', () => {
  it('cancels and rejects a stalled body when the wall-clock deadline expires', async () => {
    vi.useFakeTimers()
    try {
      let signal: AbortSignal | undefined
      const cancel = vi.fn()
      const response = await fetchWithTimeout('https://upstream.example', {
        timeoutMs: 50,
        fetchImpl: async (_input, init) => {
          signal = init?.signal ?? undefined
          return new Response(new ReadableStream({ start() {}, cancel }))
        },
      })
      const body = response.text()
      const bodyFailure = expect(body).rejects.toThrow('Request timed out after 50ms')
      expect(signal?.aborted).toBe(false)
      await vi.advanceTimersByTimeAsync(51)
      expect(signal?.aborted).toBe(true)
      await bodyFailure
      expect(cancel).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('clears the deadline and cancels the source when the caller cancels', async () => {
    vi.useFakeTimers()
    try {
      let signal: AbortSignal | undefined
      const cancel = vi.fn()
      const response = await fetchWithTimeout('https://upstream.example', {
        timeoutMs: 50,
        fetchImpl: async (_input, init) => {
          signal = init?.signal ?? undefined
          return new Response(new ReadableStream({ start() {}, cancel }))
        },
      })

      await response.body?.cancel('caller finished')
      await vi.advanceTimersByTimeAsync(51)
      expect(cancel).toHaveBeenCalledOnce()
      expect(signal?.aborted).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancels an unread response body at the same deadline', async () => {
    vi.useFakeTimers()
    try {
      let signal: AbortSignal | undefined
      const cancel = vi.fn()
      await fetchWithTimeout('https://upstream.example', {
        timeoutMs: 50,
        fetchImpl: async (_input, init) => {
          signal = init?.signal ?? undefined
          return new Response(new ReadableStream({ start() {}, cancel }))
        },
      })

      await vi.advanceTimersByTimeAsync(51)
      expect(signal?.aborted).toBe(true)
      expect(cancel).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('settles an abort/read race without retaining a reader lock', async () => {
    vi.useFakeTimers()
    try {
      let releaseChunk: (() => void) | undefined
      const source = new ReadableStream<Uint8Array>({
        async pull(controller) {
          await new Promise<void>((resolve) => {
            releaseChunk = resolve
          })
          controller.enqueue(new Uint8Array([1]))
        },
      })
      const response = await fetchWithTimeout('https://upstream.example', {
        timeoutMs: 50,
        fetchImpl: async () => new Response(source),
      })
      const read = response.body?.getReader().read()
      const readFailure = expect(read).rejects.toThrow('Request timed out after 50ms')

      await vi.advanceTimersByTimeAsync(51)
      releaseChunk?.()
      await readFailure
      expect(source.locked).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})
