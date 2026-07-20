import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { watch } from 'vue'

import { useConvexUploadQueue } from '../../src/runtime/composables/useConvexUploadQueue'
import { MockConvexClient, mockFnRef } from '../helpers/mock-convex-client'
import { captureInNuxt, installIdentityPortHarness } from '../helpers/nuxt-runtime-harness'
import { waitFor } from '../helpers/wait-for'

interface UploadPlan {
  status: number
  responseText: string
  delayMs: number
}

interface FakeUploadListenerMap {
  onprogress: ((event: ProgressEvent) => void) | null
}

class FakeQueueXhr {
  static plans = new Map<string, UploadPlan>()
  static inflight = 0
  static maxInflight = 0

  static reset() {
    FakeQueueXhr.plans.clear()
    FakeQueueXhr.inflight = 0
    FakeQueueXhr.maxInflight = 0
  }

  static setPlan(url: string, plan: Partial<UploadPlan> = {}) {
    FakeQueueXhr.plans.set(url, {
      status: plan.status ?? 200,
      responseText: plan.responseText ?? JSON.stringify({ storageId: `storage:${url}` }),
      delayMs: plan.delayMs ?? 0,
    })
  }

  upload: FakeUploadListenerMap = { onprogress: null }
  status = 0
  statusText = ''
  responseText = ''
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null

  private requestUrl = ''
  private done = false
  private timer: ReturnType<typeof setTimeout> | null = null

  open(_method: string, url: string) {
    this.requestUrl = url
  }

  setRequestHeader(_k: string, _v: string) {}

  send(file: File) {
    const plan = FakeQueueXhr.plans.get(this.requestUrl) ?? {
      status: 200,
      responseText: JSON.stringify({ storageId: `storage:${file.name}` }),
      delayMs: 0,
    }

    FakeQueueXhr.inflight += 1
    FakeQueueXhr.maxInflight = Math.max(FakeQueueXhr.maxInflight, FakeQueueXhr.inflight)

    const half = Math.max(1, Math.floor(file.size / 2))
    this.upload.onprogress?.({
      lengthComputable: true,
      loaded: half,
      total: file.size,
    } as ProgressEvent)

    this.timer = setTimeout(() => {
      if (this.done) return
      this.upload.onprogress?.({
        lengthComputable: true,
        loaded: file.size,
        total: file.size,
      } as ProgressEvent)
      this.status = plan.status
      this.responseText = plan.responseText
      this.finish()
      this.onload?.()
    }, plan.delayMs)
  }

  abort() {
    if (this.done) return
    if (this.timer) clearTimeout(this.timer)
    this.finish()
    this.onabort?.()
  }

  private finish() {
    if (this.done) return
    this.done = true
    FakeQueueXhr.inflight = Math.max(0, FakeQueueXhr.inflight - 1)
  }
}

const originalXhr = globalThis.XMLHttpRequest

beforeEach(() => {
  globalThis.XMLHttpRequest = FakeQueueXhr as unknown as typeof XMLHttpRequest
  FakeQueueXhr.reset()
})

afterAll(() => {
  globalThis.XMLHttpRequest = originalXhr
})

function makeFile(name: string, sizeBytes: number): File {
  const content = 'x'.repeat(Math.max(1, sizeBytes))
  return new File([content], name, { type: 'application/octet-stream' })
}

describe('useConvexUploadQueue (Nuxt runtime)', () => {
  it('processes 10 uploads with default runtime concurrency', async () => {
    const convex = new MockConvexClient()
    const mutation = mockFnRef<'mutation'>('files:generateUploadUrl:queue-default')
    convex.setMutationHandler('files:generateUploadUrl:queue-default', async (args) => {
      const id = (args as { id: string }).id
      return `http://upload.local/${id}`
    })

    for (let i = 0; i < 10; i++) {
      FakeQueueXhr.setPlan(`http://upload.local/${i}`, { delayMs: 20 })
    }

    const { result } = await captureInNuxt(() => useConvexUploadQueue(mutation), {
      convex,
      convexConfig: { upload: { maxConcurrent: 3 } },
    })

    void result.enqueue(
      Array.from({ length: 10 }).map((_, i) => ({
        file: makeFile(`f-${i}.bin`, 10),
        mutationArgs: { id: String(i) },
      })),
    )

    await waitFor(() => result.successCount.value === 10, { timeoutMs: 4000 })

    expect(FakeQueueXhr.maxInflight).toBeLessThanOrEqual(3)
    expect(result.aggregateProgress.value).toBe(100)
    expect(result.pendingCount.value).toBe(0)
    expect(result.queuedCount.value).toBe(0)
  })

  it('lets per-instance maxConcurrent override runtime config', async () => {
    const convex = new MockConvexClient()
    const mutation = mockFnRef<'mutation'>('files:generateUploadUrl:queue-override')
    convex.setMutationHandler('files:generateUploadUrl:queue-override', async (args) => {
      const id = (args as { id: string }).id
      return `http://upload.local/${id}`
    })

    for (let i = 0; i < 4; i++) {
      FakeQueueXhr.setPlan(`http://upload.local/${i}`, { delayMs: 20 })
    }

    const { result } = await captureInNuxt(
      () => useConvexUploadQueue(mutation, { maxConcurrent: 2 }),
      {
        convex,
        convexConfig: { upload: { maxConcurrent: 1 } },
      },
    )

    void result.enqueue(
      Array.from({ length: 4 }).map((_, i) => ({
        file: makeFile(`f-${i}.bin`, 10),
        mutationArgs: { id: String(i) },
      })),
    )

    await waitFor(() => result.successCount.value === 4, { timeoutMs: 3000 })
    expect(FakeQueueXhr.maxInflight).toBeLessThanOrEqual(2)
  })

  it('computes aggregateProgress using byte-weighted math', async () => {
    const convex = new MockConvexClient()
    const mutation = mockFnRef<'mutation'>('files:generateUploadUrl:queue-progress')
    convex.setMutationHandler('files:generateUploadUrl:queue-progress', async (args) => {
      const id = (args as { id: string }).id
      return `http://upload.local/${id}`
    })

    FakeQueueXhr.setPlan('http://upload.local/small', { delayMs: 10 })
    FakeQueueXhr.setPlan('http://upload.local/large', { delayMs: 120 })

    const { result } = await captureInNuxt(
      () => useConvexUploadQueue(mutation, { maxConcurrent: 2 }),
      { convex },
    )

    void result.enqueue([
      { file: makeFile('small.bin', 10), mutationArgs: { id: 'small' } },
      { file: makeFile('large.bin', 90), mutationArgs: { id: 'large' } },
    ])

    await waitFor(() => result.successCount.value === 1 && result.pendingCount.value === 1, {
      timeoutMs: 2000,
    })

    // small complete (10/10), large halfway (45/90): 55/100 => 55%
    expect(result.aggregateProgress.value).toBe(55)

    await waitFor(() => result.successCount.value === 2, { timeoutMs: 3000 })
    expect(result.aggregateProgress.value).toBe(100)
  })

  it('continues processing by default after an item error', async () => {
    const convex = new MockConvexClient()
    const mutation = mockFnRef<'mutation'>('files:generateUploadUrl:queue-errors')
    convex.setMutationHandler('files:generateUploadUrl:queue-errors', async (args) => {
      const id = (args as { id: string }).id
      return `http://upload.local/${id}`
    })

    FakeQueueXhr.setPlan('http://upload.local/first', {
      status: 500,
      responseText: 'fail',
      delayMs: 10,
    })
    FakeQueueXhr.setPlan('http://upload.local/second', { delayMs: 10 })
    FakeQueueXhr.setPlan('http://upload.local/third', { delayMs: 10 })

    const { result } = await captureInNuxt(
      () => useConvexUploadQueue(mutation, { maxConcurrent: 1 }),
      { convex },
    )

    void result
      .enqueue([
        { file: makeFile('first.bin', 10), mutationArgs: { id: 'first' } },
        { file: makeFile('second.bin', 10), mutationArgs: { id: 'second' } },
        { file: makeFile('third.bin', 10), mutationArgs: { id: 'third' } },
      ])
      .catch(() => {})

    await waitFor(() => result.successCount.value === 2 && result.errorCount.value === 1, {
      timeoutMs: 3000,
    })

    expect(result.queuedCount.value).toBe(0)
    expect(result.pendingCount.value).toBe(0)
    expect(result.hasErrors.value).toBe(true)
  })

  it('settles stopped items without resurrecting them on the next enqueue', async () => {
    const convex = new MockConvexClient()
    const mutation = mockFnRef<'mutation'>('files:generateUploadUrl:queue-stop-on-error')
    convex.setMutationHandler('files:generateUploadUrl:queue-stop-on-error', async (args) => {
      const id = (args as { id: string }).id
      return `http://upload.local/${id}`
    })

    FakeQueueXhr.setPlan('http://upload.local/first', {
      status: 500,
      responseText: 'fail',
      delayMs: 10,
    })
    FakeQueueXhr.setPlan('http://upload.local/second', { delayMs: 10 })
    FakeQueueXhr.setPlan('http://upload.local/third', { delayMs: 10 })

    const { result } = await captureInNuxt(
      () =>
        useConvexUploadQueue(mutation, {
          maxConcurrent: 1,
          continueOnError: false,
        }),
      { convex },
    )

    const enqueueResultPromise = result
      .enqueue([
        { file: makeFile('first.bin', 10), mutationArgs: { id: 'first' } },
        { file: makeFile('second.bin', 10), mutationArgs: { id: 'second' } },
        { file: makeFile('third.bin', 10), mutationArgs: { id: 'third' } },
      ])
      .then(
        (storageIds) => ({ ok: true as const, storageIds }),
        (error) => ({ ok: false as const, error }),
      )

    await waitFor(() => result.errorCount.value === 1 && result.pendingCount.value === 0, {
      timeoutMs: 2000,
    })

    const enqueueResult = await enqueueResultPromise
    expect(enqueueResult.ok).toBe(false)
    if (enqueueResult.ok) {
      throw new Error('Expected enqueue to fail after halt')
    }
    expect(enqueueResult.error).toBeInstanceOf(AggregateError)
    expect(enqueueResult.error.message).toMatch(/uploads failed|halted/i)
    // still-queued items are settled to 'cancelled' on halt, not left
    // dangling in 'queued' (which would let a later enqueue() resurrect them).
    expect(result.queuedCount.value).toBe(0)
    expect(result.cancelledCount.value).toBe(2)
    expect(result.isRunning.value).toBe(false)

    FakeQueueXhr.setPlan('http://upload.local/fourth', { delayMs: 10 })
    const storageIds = await result.enqueue([
      { file: makeFile('fourth.bin', 10), mutationArgs: { id: 'fourth' } },
    ])

    expect(storageIds).toEqual(['storage:http://upload.local/fourth'])
    expect(result.cancelledCount.value).toBe(2)
    expect(result.successCount.value).toBe(1)
    expect(result.queuedCount.value).toBe(0)
  })

  it('enqueue resolves with uploaded storageIds', async () => {
    const convex = new MockConvexClient()
    const mutation = mockFnRef<'mutation'>('files:generateUploadUrl:queue-awaitable')
    convex.setMutationHandler('files:generateUploadUrl:queue-awaitable', async (args) => {
      const id = (args as { id: string }).id
      return `http://upload.local/${id}`
    })

    FakeQueueXhr.setPlan('http://upload.local/one', {
      delayMs: 10,
      responseText: JSON.stringify({ storageId: 'storage:one' }),
    })
    FakeQueueXhr.setPlan('http://upload.local/two', {
      delayMs: 10,
      responseText: JSON.stringify({ storageId: 'storage:two' }),
    })

    const { result } = await captureInNuxt(
      () => useConvexUploadQueue(mutation, { maxConcurrent: 2 }),
      { convex },
    )

    const storageIds = await result.enqueue([
      { file: makeFile('one.bin', 10), mutationArgs: { id: 'one' } },
      { file: makeFile('two.bin', 10), mutationArgs: { id: 'two' } },
    ])

    expect(storageIds).toEqual(['storage:one', 'storage:two'])
    expect(result.successCount.value).toBe(2)
  })

  it('enqueueSafe returns failure result when any upload fails', async () => {
    const convex = new MockConvexClient()
    const mutation = mockFnRef<'mutation'>('files:generateUploadUrl:queue-safe')
    convex.setMutationHandler('files:generateUploadUrl:queue-safe', async (args) => {
      const id = (args as { id: string }).id
      return `http://upload.local/${id}`
    })

    FakeQueueXhr.setPlan('http://upload.local/one', { delayMs: 10 })
    FakeQueueXhr.setPlan('http://upload.local/two', {
      delayMs: 10,
      status: 500,
      responseText: 'fail',
    })
    const onItemError = vi.fn((item: { status: string }) => {
      item.status = 'queued'
      throw new Error('consumer callback failed')
    })

    const { result } = await captureInNuxt(
      () =>
        useConvexUploadQueue(mutation, {
          maxConcurrent: 2,
          continueOnError: true,
          onItemError: (item) => onItemError(item as { status: string }),
        }),
      { convex },
    )

    const safe = await result.enqueueSafe([
      { file: makeFile('one.bin', 10), mutationArgs: { id: 'one' } },
      { file: makeFile('two.bin', 10), mutationArgs: { id: 'two' } },
    ])

    expect(safe.ok).toBe(false)
    if (safe.ok) {
      throw new Error('Expected enqueueSafe to fail')
    }
    expect(safe.error.message).toMatch(/upload/i)
    expect(onItemError).toHaveBeenCalledOnce()
    expect(result.errorCount.value).toBe(1)
    expect(result.queuedCount.value).toBe(0)
  })

  it('supports cancelItem, cancelAll, and clearFinished', async () => {
    const convex = new MockConvexClient()
    const mutation = mockFnRef<'mutation'>('files:generateUploadUrl:queue-cancel')
    convex.setMutationHandler('files:generateUploadUrl:queue-cancel', async (args) => {
      const id = (args as { id: string }).id
      return `http://upload.local/${id}`
    })

    FakeQueueXhr.setPlan('http://upload.local/one', { delayMs: 120 })
    FakeQueueXhr.setPlan('http://upload.local/two', { delayMs: 120 })
    FakeQueueXhr.setPlan('http://upload.local/three', { delayMs: 120 })

    const { result } = await captureInNuxt(
      () => useConvexUploadQueue(mutation, { maxConcurrent: 1 }),
      { convex },
    )

    void result
      .enqueue([
        { file: makeFile('one.bin', 10), mutationArgs: { id: 'one' } },
        { file: makeFile('two.bin', 10), mutationArgs: { id: 'two' } },
        { file: makeFile('three.bin', 10), mutationArgs: { id: 'three' } },
      ])
      .catch(() => {})
    const firstId = result.items.value[0]?.id
    if (!firstId) throw new Error('Expected first queued item id')

    await waitFor(() => result.pendingCount.value === 1, { timeoutMs: 1000 })
    result.cancelItem(firstId)

    await waitFor(() => result.cancelledCount.value >= 1, { timeoutMs: 1000 })

    result.cancelAll()
    await waitFor(() => result.cancelledCount.value === 3, { timeoutMs: 2000 })

    result.clearFinished()
    expect(result.items.value.length).toBe(0)
  })

  it('rejects enqueue when a queued item is cancelled', async () => {
    const convex = new MockConvexClient()
    const mutation = mockFnRef<'mutation'>('files:generateUploadUrl:queue-cancel-reject')
    convex.setMutationHandler('files:generateUploadUrl:queue-cancel-reject', async (args) => {
      const id = (args as { id: string }).id
      return `http://upload.local/${id}`
    })

    FakeQueueXhr.setPlan('http://upload.local/one', { delayMs: 120 })
    FakeQueueXhr.setPlan('http://upload.local/two', { delayMs: 120 })

    const { result } = await captureInNuxt(
      () => useConvexUploadQueue(mutation, { maxConcurrent: 1 }),
      { convex },
    )

    const enqueueResultPromise = result
      .enqueue([
        { file: makeFile('one.bin', 10), mutationArgs: { id: 'one' } },
        { file: makeFile('two.bin', 10), mutationArgs: { id: 'two' } },
      ])
      .then(
        (storageIds) => ({ ok: true as const, storageIds }),
        (error) => ({ ok: false as const, error }),
      )

    await waitFor(() => result.queuedCount.value >= 1 && result.pendingCount.value === 1, {
      timeoutMs: 1000,
    })
    const queuedItem = result.items.value.find((item) => item.status === 'queued')
    if (!queuedItem) throw new Error('Expected queued upload item to cancel')
    result.cancelItem(queuedItem.id)

    const enqueueResult = await enqueueResultPromise
    expect(enqueueResult.ok).toBe(false)
    if (enqueueResult.ok) {
      throw new Error('Expected enqueue to fail after cancellation')
    }
    expect(enqueueResult.error.message).toMatch(/cancelled/i)
  })

  it('retires active and queued work on identity change and permits a fresh batch', async () => {
    const convex = new MockConvexClient()
    const mutation = mockFnRef<'mutation'>('files:generateUploadUrl:queue-identity-change')
    convex.setMutationHandler('files:generateUploadUrl:queue-identity-change', async (args) => {
      const id = (args as { id: string }).id
      return `http://upload.local/${id}`
    })
    FakeQueueXhr.setPlan('http://upload.local/first', { delayMs: 200 })
    FakeQueueXhr.setPlan('http://upload.local/second', { delayMs: 0 })
    const onItemSuccess = vi.fn()
    const onItemError = vi.fn()
    const onQueueIdle = vi.fn()
    let identity!: ReturnType<typeof installIdentityPortHarness>
    let enqueueFreshOnRetirement = false
    let freshBatch: Promise<string[]> | null = null
    FakeQueueXhr.setPlan('http://upload.local/third', {
      delayMs: 0,
      responseText: JSON.stringify({ storageId: 'storage:third' }),
    })

    const { result } = await captureInNuxt(
      () => {
        identity = installIdentityPortHarness()
        const queue = useConvexUploadQueue(mutation, {
          maxConcurrent: 1,
          onItemSuccess,
          onItemError,
          onQueueIdle,
        })
        watch(
          queue.items,
          (items) => {
            if (enqueueFreshOnRetirement && items.length === 0 && !freshBatch) {
              freshBatch = queue.enqueue([
                { file: makeFile('third.bin', 10), mutationArgs: { id: 'third' } },
              ])
            }
          },
          { flush: 'sync' },
        )
        return queue
      },
      { convex },
    )

    const firstBatch = result
      .enqueue([
        { file: makeFile('first.bin', 10), mutationArgs: { id: 'first' } },
        { file: makeFile('second.bin', 10), mutationArgs: { id: 'second' } },
      ])
      .then(
        (storageIds) => ({ ok: true as const, storageIds }),
        (error) => ({ ok: false as const, error }),
      )
    await waitFor(() => result.pendingCount.value === 1 && result.queuedCount.value === 1)
    expect(convex.calls.mutation).toHaveLength(1)

    enqueueFreshOnRetirement = true
    identity.advance()

    expect(onItemSuccess).not.toHaveBeenCalled()
    expect(onItemError).not.toHaveBeenCalled()
    expect(onQueueIdle).not.toHaveBeenCalled()
    const firstOutcome = await firstBatch
    expect(firstOutcome.ok).toBe(false)
    if (firstOutcome.ok) throw new Error('Expected the retired batch to reject')
    expect(firstOutcome.error).toMatchObject({
      kind: 'authentication',
      code: 'IDENTITY_CHANGED',
    })

    if (!freshBatch) throw new Error('Expected fresh batch to start during retirement')
    await expect(freshBatch).resolves.toEqual(['storage:third'])
    expect(convex.calls.mutation).toHaveLength(2)
    expect(convex.calls.mutation[1]?.args).toEqual({ id: 'third' })
    expect(onItemSuccess).toHaveBeenCalledOnce()
    expect(onItemSuccess.mock.calls[0]?.[0].file.name).toBe('third.bin')
    expect(onItemError).not.toHaveBeenCalled()
    expect(onQueueIdle).toHaveBeenCalledOnce()

    // Finished rows remain identity-owned, but clearing them must not emit idle again.
    identity.advance()
    expect(result.items.value).toEqual([])
    expect(result.successCount.value).toBe(0)
    expect(onQueueIdle).toHaveBeenCalledOnce()
  })

  it('settles when identity changes synchronously during queued-item publication', async () => {
    const convex = new MockConvexClient()
    const mutation = mockFnRef<'mutation'>('files:generateUploadUrl:queue-publish-boundary')
    convex.setMutationHandler(
      'files:generateUploadUrl:queue-publish-boundary',
      async () => 'http://upload.local/publish-boundary',
    )
    let identity!: ReturnType<typeof installIdentityPortHarness>
    let advanced = false

    const { result } = await captureInNuxt(
      () => {
        identity = installIdentityPortHarness()
        const queue = useConvexUploadQueue(mutation)
        watch(
          queue.items,
          (items) => {
            if (!advanced && items.some((item) => item.status === 'queued')) {
              advanced = true
              identity.advance()
            }
          },
          { flush: 'sync' },
        )
        return queue
      },
      { convex },
    )

    await expect(result.enqueue([makeFile('a.bin', 10)])).rejects.toMatchObject({
      code: 'IDENTITY_CHANGED',
    })
    expect(result.items.value).toEqual([])
    expect(result.isRunning.value).toBe(false)
    expect(convex.calls.mutation).toHaveLength(0)
  })

  it.each([
    { boundary: 'success', watchedStatus: 'success' as const, xhrStatus: 200 },
    { boundary: 'error', watchedStatus: 'error' as const, xhrStatus: 500 },
  ])(
    'does not emit $boundary after a synchronous item watcher changes identity',
    async ({ boundary, watchedStatus, xhrStatus }) => {
      const convex = new MockConvexClient()
      const mutationName = `files:generateUploadUrl:queue-${boundary}-boundary`
      const uploadUrl = `http://upload.local/${boundary}-boundary`
      const mutation = mockFnRef<'mutation'>(mutationName)
      convex.setMutationHandler(mutationName, async () => uploadUrl)
      FakeQueueXhr.setPlan(uploadUrl, {
        status: xhrStatus,
        responseText: JSON.stringify({ storageId: `storage:${boundary}-boundary` }),
      })
      const onItemSuccess = vi.fn()
      const onItemError = vi.fn()
      let identity!: ReturnType<typeof installIdentityPortHarness>

      const { result } = await captureInNuxt(
        () => {
          identity = installIdentityPortHarness()
          const queue = useConvexUploadQueue(mutation, {
            continueOnError: boundary !== 'error',
            onItemSuccess,
            onItemError,
          })
          watch(
            queue.items,
            (items) => {
              if (items.some((item) => item.status === watchedStatus)) identity.advance()
            },
            { flush: 'sync' },
          )
          return queue
        },
        { convex },
      )

      await expect(result.enqueue([makeFile('a.bin', 10)])).rejects.toMatchObject({
        code: 'IDENTITY_CHANGED',
      })
      expect(result.items.value).toEqual([])
      expect(onItemSuccess).not.toHaveBeenCalled()
      expect(onItemError).not.toHaveBeenCalled()
    },
  )

  it('returns identity change when cancellation publication crosses the boundary', async () => {
    const convex = new MockConvexClient()
    const mutation = mockFnRef<'mutation'>('files:generateUploadUrl:queue-cancel-boundary')
    convex.setMutationHandler(
      'files:generateUploadUrl:queue-cancel-boundary',
      async () => 'http://upload.local/cancel-boundary',
    )
    FakeQueueXhr.setPlan('http://upload.local/cancel-boundary', { delayMs: 200 })
    let identity!: ReturnType<typeof installIdentityPortHarness>

    const { result } = await captureInNuxt(
      () => {
        identity = installIdentityPortHarness()
        const queue = useConvexUploadQueue(mutation)
        watch(
          queue.items,
          (items) => {
            if (items.some((item) => item.status === 'cancelled')) identity.advance()
          },
          { flush: 'sync' },
        )
        return queue
      },
      { convex },
    )

    const pending = result.enqueue([makeFile('a.bin', 10)])
    await waitFor(() => result.pendingCount.value === 1)
    const itemId = result.items.value[0]?.id
    if (!itemId) throw new Error('Expected pending upload item')
    result.cancelItem(itemId)

    await expect(pending).rejects.toMatchObject({ code: 'IDENTITY_CHANGED' })
    expect(result.items.value).toEqual([])
    expect(result.isRunning.value).toBe(false)
  })

  it('does not let cancelAll abort B work enqueued during A retirement', async () => {
    const convex = new MockConvexClient()
    const mutation = mockFnRef<'mutation'>('files:generateUploadUrl:queue-cancel-all-boundary')
    convex.setMutationHandler('files:generateUploadUrl:queue-cancel-all-boundary', async (args) => {
      return `http://upload.local/${(args as { id: string }).id}`
    })
    FakeQueueXhr.setPlan('http://upload.local/first', { delayMs: 200 })
    FakeQueueXhr.setPlan('http://upload.local/fresh', {
      responseText: JSON.stringify({ storageId: 'storage:fresh' }),
    })
    let identity!: ReturnType<typeof installIdentityPortHarness>
    let retireOnCancellation = false
    let freshBatch: Promise<string[]> | null = null

    const { result } = await captureInNuxt(
      () => {
        identity = installIdentityPortHarness()
        const queue = useConvexUploadQueue(mutation, { maxConcurrent: 1 })
        watch(
          queue.items,
          (items) => {
            if (
              retireOnCancellation &&
              !freshBatch &&
              items.some((item) => item.status === 'cancelled')
            ) {
              identity.advance()
              freshBatch = queue.enqueue([
                { file: makeFile('fresh.bin', 10), mutationArgs: { id: 'fresh' } },
              ])
            }
          },
          { flush: 'sync' },
        )
        return queue
      },
      { convex },
    )

    const retiredBatch = result.enqueue([
      { file: makeFile('first.bin', 10), mutationArgs: { id: 'first' } },
      { file: makeFile('second.bin', 10), mutationArgs: { id: 'second' } },
    ])
    await waitFor(() => result.pendingCount.value === 1 && result.queuedCount.value === 1)
    retireOnCancellation = true
    result.cancelAll()

    await expect(retiredBatch).rejects.toMatchObject({ code: 'IDENTITY_CHANGED' })
    if (!freshBatch) throw new Error('Expected B batch to be enqueued during cancellation')
    await expect(freshBatch).resolves.toEqual(['storage:fresh'])
    expect(result.successCount.value).toBe(1)
  })

  it('preserves B work enqueued synchronously while reset clears A', async () => {
    const convex = new MockConvexClient()
    const mutation = mockFnRef<'mutation'>('files:generateUploadUrl:queue-reset-boundary')
    convex.setMutationHandler('files:generateUploadUrl:queue-reset-boundary', async (args) => {
      return `http://upload.local/${(args as { id: string }).id}`
    })
    FakeQueueXhr.setPlan('http://upload.local/first', { delayMs: 200 })
    FakeQueueXhr.setPlan('http://upload.local/fresh', {
      responseText: JSON.stringify({ storageId: 'storage:fresh' }),
    })
    let enqueueFreshOnReset = false
    let freshBatch: Promise<string[]> | null = null

    const { result } = await captureInNuxt(
      () => {
        const queue = useConvexUploadQueue(mutation)
        watch(
          queue.items,
          (items) => {
            if (enqueueFreshOnReset && items.length === 0 && !freshBatch) {
              freshBatch = queue.enqueue([
                { file: makeFile('fresh.bin', 10), mutationArgs: { id: 'fresh' } },
              ])
            }
          },
          { flush: 'sync' },
        )
        return queue
      },
      { convex },
    )

    const resetBatch = result.enqueue([
      { file: makeFile('first.bin', 10), mutationArgs: { id: 'first' } },
    ])
    await waitFor(() => result.pendingCount.value === 1)
    enqueueFreshOnReset = true
    result.reset()

    await expect(resetBatch).rejects.toThrow('reset')
    if (!freshBatch) throw new Error('Expected fresh batch to be enqueued during reset')
    await expect(freshBatch).resolves.toEqual(['storage:fresh'])
    expect(result.successCount.value).toBe(1)
  })

  it('does not return A results when onQueueIdle changes identity synchronously', async () => {
    const convex = new MockConvexClient()
    const mutation = mockFnRef<'mutation'>('files:generateUploadUrl:queue-idle-boundary')
    convex.setMutationHandler(
      'files:generateUploadUrl:queue-idle-boundary',
      async () => 'http://upload.local/idle-boundary',
    )
    FakeQueueXhr.setPlan('http://upload.local/idle-boundary', {
      responseText: JSON.stringify({ storageId: 'storage:idle-boundary' }),
    })
    const onQueueIdle = vi.fn()
    let identity!: ReturnType<typeof installIdentityPortHarness>

    const { result } = await captureInNuxt(
      () => {
        identity = installIdentityPortHarness()
        return useConvexUploadQueue(mutation, {
          onQueueIdle: (items) => {
            onQueueIdle(items)
            identity.advance()
          },
        })
      },
      { convex },
    )

    await expect(result.enqueue([makeFile('a.bin', 10)])).rejects.toMatchObject({
      code: 'IDENTITY_CHANGED',
    })
    expect(onQueueIdle).toHaveBeenCalledOnce()
    expect(result.items.value).toEqual([])
  })

  it.each(['watcher', 'callback'] as const)(
    'commits success before a same-generation %s calls cancelAll',
    async (cancellationSource) => {
      const convex = new MockConvexClient()
      const mutation = mockFnRef<'mutation'>('files:generateUploadUrl:queue-success-commit')
      convex.setMutationHandler(
        'files:generateUploadUrl:queue-success-commit',
        async () => 'http://upload.local/success-commit',
      )
      FakeQueueXhr.setPlan('http://upload.local/success-commit', {
        responseText: JSON.stringify({ storageId: 'storage:success-commit' }),
      })

      const { result } = await captureInNuxt(
        () => {
          const queue = useConvexUploadQueue(mutation, {
            onItemSuccess: () => {
              if (cancellationSource === 'callback') queue.cancelAll()
            },
          })
          if (cancellationSource === 'watcher') {
            watch(
              queue.items,
              (items) => {
                if (items.some((item) => item.status === 'success')) queue.cancelAll()
              },
              { flush: 'sync' },
            )
          }
          return queue
        },
        { convex },
      )

      await expect(result.enqueue([makeFile('a.bin', 10)])).resolves.toEqual([
        'storage:success-commit',
      ])
      expect(result.successCount.value).toBe(1)
      expect(result.cancelledCount.value).toBe(0)
    },
  )
})
