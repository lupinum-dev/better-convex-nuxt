import { afterEach, describe, expect, it, vi } from 'vitest'

import { useConvexFileUpload } from '../../src/runtime/composables/useConvexFileUpload'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'
import { MockConvexClient, mockFnRef } from '../helpers/mock-convex-client'
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

describe('useConvexFileUpload (Nuxt runtime)', () => {
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
})
