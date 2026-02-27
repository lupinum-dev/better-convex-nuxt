import type { ConvexClient } from 'convex/browser'
import type { FunctionArgs, FunctionReference } from 'convex/server'

export interface UploadProgressInfo {
  loaded: number
  total: number
  percent: number
}

export interface UploadFileViaXhrOptions {
  signal?: AbortSignal
  onProgress?: (info: UploadProgressInfo) => void
}

function createAbortError(): Error {
  return new DOMException('Upload cancelled', 'AbortError')
}

export async function requestUploadUrl<Mutation extends FunctionReference<'mutation'>>(
  client: ConvexClient | null,
  mutation: Mutation,
  mutationArgs: FunctionArgs<Mutation>,
): Promise<string> {
  if (!client) {
    throw new Error('ConvexClient not available - file uploads only work on client side')
  }

  const postUrl = await client.mutation(mutation, mutationArgs)
  if (typeof postUrl !== 'string') {
    throw new TypeError('generateUploadUrl mutation must return a string URL')
  }
  return postUrl
}

export function uploadFileViaXhr(
  postUrl: string,
  file: File,
  options?: UploadFileViaXhrOptions,
): Promise<string> {
  const { signal, onProgress } = options ?? {}

  if (signal?.aborted) {
    return Promise.reject(createAbortError())
  }

  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    const cleanup = () => {
      if (signal) {
        signal.removeEventListener('abort', onAbortSignal)
      }
    }

    const fail = (error: Error) => {
      cleanup()
      reject(error)
    }

    const onAbortSignal = () => {
      try {
        xhr.abort()
      } catch {
        fail(createAbortError())
      }
    }

    if (signal) {
      signal.addEventListener('abort', onAbortSignal, { once: true })
    }

    xhr.open('POST', postUrl)
    if (file.type) {
      xhr.setRequestHeader('Content-Type', file.type)
    }

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return
      const percent = Math.round((event.loaded / event.total) * 100)
      onProgress?.({
        loaded: event.loaded,
        total: event.total,
        percent,
      })
    }

    xhr.onload = () => {
      cleanup()
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText) as { storageId?: unknown }
          if (typeof response?.storageId !== 'string' || response.storageId.length === 0) {
            reject(new Error('Upload endpoint response missing valid storageId'))
            return
          }
          resolve(response.storageId)
        } catch {
          reject(new Error('Invalid response from upload endpoint'))
        }
      } else {
        reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`))
      }
    }

    xhr.onerror = () => {
      fail(new Error('Network error during upload'))
    }

    xhr.onabort = () => {
      fail(createAbortError())
    }

    xhr.send(file)
  })
}
