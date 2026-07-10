import { afterEach, describe, expect, it, vi } from 'vitest'

import { useConvexFileUpload } from '../../src/runtime/composables/useConvexFileUpload'
import { MockConvexClient, mockFnRef } from '../helpers/mock-convex-client'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'
import { waitFor } from '../helpers/wait-for'

interface FakeUploadListenerMap {
  onprogress: ((event: ProgressEvent) => void) | null
}

class FakeXhr {
  static next = {
    status: 200,
    responseText: JSON.stringify({ storageId: 'storage_1' }),
  }
  static delayMs = 0

  upload: FakeUploadListenerMap = { onprogress: null }
  status = 0
  statusText = ''
  responseText = ''
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null

  open(_method: string, _url: string) {}
  setRequestHeader(_k: string, _v: string) {}

  send(_file: File) {
    this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 } as ProgressEvent)
    setTimeout(() => {
      this.status = FakeXhr.next.status
      this.responseText = FakeXhr.next.responseText
      this.onload?.()
    }, FakeXhr.delayMs)
  }

  abort() {
    this.onabort?.()
  }
}

const originalXhr = globalThis.XMLHttpRequest

afterEach(() => {
  globalThis.XMLHttpRequest = originalXhr
  FakeXhr.delayMs = 0
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useConvexFileUpload (Nuxt runtime)', () => {
  it('can be created during SSR setup without a Convex client and fails when called', async () => {
    const mutation = mockFnRef<'mutation'>('files:ssr-safe-upload-url')

    const { result } = await captureInNuxt(() => useConvexFileUpload(mutation))
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' })

    expect(result.status.value).toBe('idle')
    await expect(result.upload(file)).rejects.toThrow('Convex client is unavailable')
    expect(result.status.value).toBe('error')
    expect(result.pending.value).toBe(false)
  })

  it('uploads file, tracks progress, and stores returned storageId', async () => {
    globalThis.XMLHttpRequest = FakeXhr as unknown as typeof XMLHttpRequest

    const convex = new MockConvexClient()
    const mutation = mockFnRef<'mutation'>('files:generateUploadUrl')
    convex.setMutationHandler('files:generateUploadUrl', async () => 'http://upload.local')

    const { result } = await captureInNuxt(() => useConvexFileUpload(mutation), { convex })
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' })

    const storageId = await result.upload(file)

    expect(storageId).toBe('storage_1')
    expect(result.progress.value).toBe(50)
    expect(result.status.value).toBe('success')
    expect(result.data.value).toBe('storage_1')
    expect(result.error.value).toBeNull()
  })

  it('emits onProgress callback payloads while uploading', async () => {
    globalThis.XMLHttpRequest = FakeXhr as unknown as typeof XMLHttpRequest

    const convex = new MockConvexClient()
    const mutation = mockFnRef<'mutation'>('files:generateUploadUrl:on-progress')
    convex.setMutationHandler(
      'files:generateUploadUrl:on-progress',
      async () => 'http://upload.local',
    )
    const onProgress = vi.fn()

    const { result } = await captureInNuxt(() => useConvexFileUpload(mutation, { onProgress }), {
      convex,
    })
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' })

    await result.upload(file)

    expect(onProgress).toHaveBeenCalledTimes(1)
    expect(onProgress).toHaveBeenCalledWith({ loaded: 5, total: 10, percent: 50 }, file)
  })

  it('validates allowedTypes and reports errors deterministically', async () => {
    const convex = new MockConvexClient()
    const mutation = mockFnRef<'mutation'>('files:generateUploadUrl')
    convex.setMutationHandler('files:generateUploadUrl', async () => 'http://upload.local')
    const onError = vi.fn()

    const { result } = await captureInNuxt(
      () => useConvexFileUpload(mutation, { allowedTypes: ['image/*'], onError }),
      { convex },
    )

    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' })
    await expect(result.upload(file)).rejects.toThrow('not allowed')
    expect(result.status.value).toBe('error')
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('cancel() aborts in-flight upload and resets state', async () => {
    globalThis.XMLHttpRequest = FakeXhr as unknown as typeof XMLHttpRequest
    FakeXhr.delayMs = 50

    const convex = new MockConvexClient()
    const mutation = mockFnRef<'mutation'>('files:generateUploadUrl')
    convex.setMutationHandler('files:generateUploadUrl', async () => 'http://upload.local')

    const { result } = await captureInNuxt(() => useConvexFileUpload(mutation), { convex })
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' })

    const uploadPromise = result.upload(file)
    await waitFor(() => result.progress.value > 0, { timeoutMs: 1000 })
    result.cancel()

    await expect(uploadPromise).rejects.toThrow()
    expect(result.status.value).toBe('idle')
    expect(result.progress.value).toBe(0)
    expect(result.data.value).toBeUndefined()
  })

  it('rejects a second concurrent upload() while one is pending', async () => {
    globalThis.XMLHttpRequest = FakeXhr as unknown as typeof XMLHttpRequest
    FakeXhr.delayMs = 20

    const convex = new MockConvexClient()
    const mutation = mockFnRef<'mutation'>('files:generateUploadUrl:concurrent')
    convex.setMutationHandler(
      'files:generateUploadUrl:concurrent',
      async () => 'http://upload.local',
    )

    const { result } = await captureInNuxt(() => useConvexFileUpload(mutation), { convex })
    const fileA = new File(['a'], 'a.txt', { type: 'text/plain' })
    const fileB = new File(['b'], 'b.txt', { type: 'text/plain' })

    // No `await` between these two calls: the first synchronously flips
    // status to 'pending' before yielding at its first `await`, so the
    // second call must see 'pending' and reject immediately — without
    // touching the first call's status/error state.
    const firstPromise = result.upload(fileA)
    expect(result.status.value).toBe('pending')

    await expect(result.upload(fileB)).rejects.toThrow('Upload already in progress')
    // The rejected concurrent call must not have clobbered the in-flight upload.
    expect(result.status.value).toBe('pending')

    const storageId = await firstPromise
    expect(storageId).toBe('storage_1')
    expect(result.status.value).toBe('success')
    expect(result.error.value).toBeNull()
  })

  it('cancel() during the URL-request phase prevents the XHR and leaves state idle', async () => {
    globalThis.XMLHttpRequest = FakeXhr as unknown as typeof XMLHttpRequest
    const sendSpy = vi.spyOn(FakeXhr.prototype, 'send')

    const convex = new MockConvexClient()
    const mutation = mockFnRef<'mutation'>('files:generateUploadUrl:cancel-during-url')
    const urlRequest = deferred<string>()
    convex.setMutationHandler('files:generateUploadUrl:cancel-during-url', async () => {
      return await urlRequest.promise
    })

    const { result } = await captureInNuxt(() => useConvexFileUpload(mutation), { convex })
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' })

    const uploadPromise = result.upload(file)
    expect(result.status.value).toBe('pending')

    // Cancel while still waiting on the generateUploadUrl mutation — before
    // the previous behavior assigned an AbortController, this was a no-op.
    result.cancel()
    expect(result.status.value).toBe('idle')

    // Now let the mutation resolve; the upload must not proceed to the XHR.
    urlRequest.resolve('http://upload.local')

    await expect(uploadPromise).rejects.toThrow()
    expect(sendSpy).not.toHaveBeenCalled()
    expect(result.status.value).toBe('idle')
    expect(result.progress.value).toBe(0)
    expect(result.data.value).toBeUndefined()
    expect(result.error.value).toBeNull()
  })
})
