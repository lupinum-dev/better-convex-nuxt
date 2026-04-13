import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'

import { useUploadQueue } from '../../src/runtime/composables/internal/upload-runtime'
import { requestUploadUrl, uploadFileViaXhr } from '../../src/runtime/utils/upload-core'

vi.mock('#imports', () => ({
  useRuntimeConfig: vi.fn(() => ({ public: { convex: {} } })),
}))

vi.mock('../../src/runtime/utils/runtime-config', () => ({
  getConvexRuntimeConfig: vi.fn(() => ({ upload: { maxConcurrent: 3 } })),
}))

vi.mock('../../src/runtime/utils/logger', () => ({
  getSharedLogger: vi.fn(() => ({
    upload: vi.fn(),
  })),
  getLogLevel: vi.fn(() => false),
}))

vi.mock('../../src/runtime/composables/useConvex', () => ({
  useConvex: vi.fn(() => ({ mutation: vi.fn() })),
}))

vi.mock('../../src/runtime/utils/upload-core', () => ({
  requestUploadUrl: vi.fn(),
  uploadFileViaXhr: vi.fn(),
}))

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('upload queue runtime (unit)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requestUploadUrl).mockResolvedValue('https://upload.test')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('respects maxConcurrent and starts queued uploads as slots free up', async () => {
    const deferredByFile = new Map<string, Deferred<string>>()
    vi.mocked(uploadFileViaXhr).mockImplementation(async (_url, file: File) => {
      const deferred = createDeferred<string>()
      deferredByFile.set(file.name, deferred)
      return await deferred.promise
    })

    const scope = effectScope()
    const upload = scope.run(() =>
      useUploadQueue({ _path: 'files:generateUploadUrl' } as never, {
        maxConcurrent: 2,
      }),
    )!

    const first = new File(['a'], 'first.txt', { type: 'text/plain' })
    const second = new File(['b'], 'second.txt', { type: 'text/plain' })
    const third = new File(['c'], 'third.txt', { type: 'text/plain' })

    const enqueuePromise = upload.enqueue([first, second, third])
    await Promise.resolve()
    await Promise.resolve()

    expect(upload.pendingCount.value).toBe(2)
    expect(vi.mocked(uploadFileViaXhr)).toHaveBeenCalledTimes(2)
    expect(deferredByFile.has('third.txt')).toBe(false)

    deferredByFile.get('first.txt')!.resolve('storage-first')
    await vi.waitFor(() => {
      expect(vi.mocked(uploadFileViaXhr)).toHaveBeenCalledTimes(3)
    })

    expect(deferredByFile.has('third.txt')).toBe(true)

    deferredByFile.get('second.txt')!.resolve('storage-second')
    deferredByFile.get('third.txt')!.resolve('storage-third')

    await expect(enqueuePromise).resolves.toEqual([
      'storage-first',
      'storage-second',
      'storage-third',
    ])

    scope.stop()
  })

  it('halts queued uploads after the first error when continueOnError is false', async () => {
    const deferredByFile = new Map<string, Deferred<string>>()
    vi.mocked(uploadFileViaXhr).mockImplementation(async (_url, file: File) => {
      const deferred = createDeferred<string>()
      deferredByFile.set(file.name, deferred)
      return await deferred.promise
    })

    const scope = effectScope()
    const upload = scope.run(() =>
      useUploadQueue({ _path: 'files:generateUploadUrl' } as never, {
        maxConcurrent: 1,
        continueOnError: false,
      }),
    )!

    const first = new File(['a'], 'first.txt', { type: 'text/plain' })
    const second = new File(['b'], 'second.txt', { type: 'text/plain' })

    const enqueuePromise = upload.enqueue([first, second])
    await Promise.resolve()
    await Promise.resolve()

    deferredByFile.get('first.txt')!.reject(new Error('upload failed'))

    await expect(enqueuePromise).rejects.toThrow(/uploads failed|upload failed/i)
    expect(vi.mocked(uploadFileViaXhr)).toHaveBeenCalledTimes(1)
    expect(upload.errorCount.value).toBe(1)
    expect(upload.queuedCount.value).toBe(1)

    scope.stop()
  })

  it('cancels queued items before they start and marks them cancelled', async () => {
    const firstDeferred = createDeferred<string>()
    vi.mocked(uploadFileViaXhr).mockImplementation(async () => await firstDeferred.promise)

    const scope = effectScope()
    const upload = scope.run(() =>
      useUploadQueue({ _path: 'files:generateUploadUrl' } as never, {
        maxConcurrent: 1,
      }),
    )!

    const first = new File(['a'], 'first.txt', { type: 'text/plain' })
    const second = new File(['b'], 'second.txt', { type: 'text/plain' })

    const enqueuePromise = upload.enqueue([first, second])
    await Promise.resolve()
    await Promise.resolve()

    const queuedItem = upload.items.value.find((item) => item.file.name === 'second.txt')
    expect(queuedItem?.status).toBe('queued')

    upload.cancelItem(queuedItem!.id)
    firstDeferred.resolve('storage-first')

    await expect(enqueuePromise).rejects.toThrow(/cancelled/i)
    expect(upload.items.value.find((item) => item.id === queuedItem!.id)?.status).toBe('cancelled')

    scope.stop()
  })

  it('emits onQueueIdle once the queue fully settles', async () => {
    const onQueueIdle = vi.fn()
    const deferred = createDeferred<string>()
    vi.mocked(uploadFileViaXhr).mockImplementation(async () => await deferred.promise)

    const scope = effectScope()
    const upload = scope.run(() =>
      useUploadQueue({ _path: 'files:generateUploadUrl' } as never, {
        maxConcurrent: 1,
        onQueueIdle,
      }),
    )!

    const file = new File(['a'], 'idle.txt', { type: 'text/plain' })
    const enqueuePromise = upload.enqueue([file])
    await Promise.resolve()
    deferred.resolve('storage-idle')

    await expect(enqueuePromise).resolves.toEqual(['storage-idle'])
    await vi.waitFor(() => {
      expect(onQueueIdle).toHaveBeenCalledTimes(1)
    })

    scope.stop()
  })
})
