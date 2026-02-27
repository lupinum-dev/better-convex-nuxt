import { afterEach, describe, expect, it } from 'vitest'

import { useConvexUploadQueue } from '../../src/runtime/composables/useConvexUploadQueue'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'
import { MockConvexClient, mockFnRef } from '../helpers/mock-convex-client'
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
    this.upload.onprogress?.({ lengthComputable: true, loaded: half, total: file.size } as ProgressEvent)

    this.timer = setTimeout(() => {
      if (this.done) return
      this.upload.onprogress?.({ lengthComputable: true, loaded: file.size, total: file.size } as ProgressEvent)
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

afterEach(() => {
  globalThis.XMLHttpRequest = originalXhr
  FakeQueueXhr.reset()
})

function makeFile(name: string, sizeBytes: number): File {
  const content = 'x'.repeat(Math.max(1, sizeBytes))
  return new File([content], name, { type: 'application/octet-stream' })
}

describe('useConvexUploadQueue (Nuxt runtime)', () => {
  it('processes 10 uploads with default runtime concurrency', async () => {
    globalThis.XMLHttpRequest = FakeQueueXhr as unknown as typeof XMLHttpRequest

    const convex = new MockConvexClient()
    const mutation = mockFnRef<'mutation'>('files:generateUploadUrl:queue-default')
    convex.setMutationHandler('files:generateUploadUrl:queue-default', async (args) => {
      const id = (args as { id: string }).id
      return `http://upload.local/${id}`
    })

    for (let i = 0; i < 10; i++) {
      FakeQueueXhr.setPlan(`http://upload.local/${i}`, { delayMs: 20 })
    }

    const { result } = await captureInNuxt(
      () => useConvexUploadQueue(mutation),
      {
        convex,
        convexConfig: { upload: { maxConcurrent: 3 } },
      },
    )

    result.enqueue(
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
    globalThis.XMLHttpRequest = FakeQueueXhr as unknown as typeof XMLHttpRequest

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

    result.enqueue(
      Array.from({ length: 4 }).map((_, i) => ({
        file: makeFile(`f-${i}.bin`, 10),
        mutationArgs: { id: String(i) },
      })),
    )

    await waitFor(() => result.successCount.value === 4, { timeoutMs: 3000 })
    expect(FakeQueueXhr.maxInflight).toBeLessThanOrEqual(2)
  })

  it('computes aggregateProgress using byte-weighted math', async () => {
    globalThis.XMLHttpRequest = FakeQueueXhr as unknown as typeof XMLHttpRequest

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

    result.enqueue([
      { file: makeFile('small.bin', 10), mutationArgs: { id: 'small' } },
      { file: makeFile('large.bin', 90), mutationArgs: { id: 'large' } },
    ])

    await waitFor(
      () => result.successCount.value === 1 && result.pendingCount.value === 1,
      { timeoutMs: 2000 },
    )

    // small complete (10/10), large halfway (45/90): 55/100 => 55%
    expect(result.aggregateProgress.value).toBe(55)

    await waitFor(() => result.successCount.value === 2, { timeoutMs: 3000 })
    expect(result.aggregateProgress.value).toBe(100)
  })

  it('continues processing by default after an item error', async () => {
    globalThis.XMLHttpRequest = FakeQueueXhr as unknown as typeof XMLHttpRequest

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

    result.enqueue([
      { file: makeFile('first.bin', 10), mutationArgs: { id: 'first' } },
      { file: makeFile('second.bin', 10), mutationArgs: { id: 'second' } },
      { file: makeFile('third.bin', 10), mutationArgs: { id: 'third' } },
    ])

    await waitFor(() => result.successCount.value === 2 && result.errorCount.value === 1, {
      timeoutMs: 3000,
    })

    expect(result.queuedCount.value).toBe(0)
    expect(result.pendingCount.value).toBe(0)
    expect(result.hasErrors.value).toBe(true)
  })

  it('stops scheduling new queued items when continueOnError is false', async () => {
    globalThis.XMLHttpRequest = FakeQueueXhr as unknown as typeof XMLHttpRequest

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
      () => useConvexUploadQueue(mutation, { maxConcurrent: 1, continueOnError: false }),
      { convex },
    )

    result.enqueue([
      { file: makeFile('first.bin', 10), mutationArgs: { id: 'first' } },
      { file: makeFile('second.bin', 10), mutationArgs: { id: 'second' } },
      { file: makeFile('third.bin', 10), mutationArgs: { id: 'third' } },
    ])

    await waitFor(() => result.errorCount.value === 1 && result.pendingCount.value === 0, {
      timeoutMs: 2000,
    })

    expect(result.queuedCount.value).toBe(2)
    expect(result.isRunning.value).toBe(false)
  })

  it('supports cancelItem, cancelAll, and clearFinished', async () => {
    globalThis.XMLHttpRequest = FakeQueueXhr as unknown as typeof XMLHttpRequest

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

    const [firstId] = result.enqueue([
      { file: makeFile('one.bin', 10), mutationArgs: { id: 'one' } },
      { file: makeFile('two.bin', 10), mutationArgs: { id: 'two' } },
      { file: makeFile('three.bin', 10), mutationArgs: { id: 'three' } },
    ])
    if (!firstId) throw new Error('Expected first queued item id')

    await waitFor(() => result.pendingCount.value === 1, { timeoutMs: 1000 })
    result.cancelItem(firstId)

    await waitFor(() => result.cancelledCount.value >= 1, { timeoutMs: 1000 })

    result.cancelAll()
    await waitFor(() => result.cancelledCount.value === 3, { timeoutMs: 2000 })

    result.clearFinished()
    expect(result.items.value.length).toBe(0)
  })
})
