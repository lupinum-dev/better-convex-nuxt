import { describe, expect, it } from 'vitest'

import type { UploadProgressInfo } from '../../src/runtime/convex/upload/upload-core'
import {
  applyUploadQueueProgress,
  cancelQueuedUploadItems,
  clearFinishedUploadItems,
  collectUploadQueueResults,
  createUploadQueueItems,
  deriveUploadQueueSummary,
  getNextQueuedUploadItem,
  markUploadQueueItemPending,
  settleUploadQueueItemCancelled,
  settleUploadQueueItemError,
  settleUploadQueueItemSuccess,
  shouldResetUploadQueueHalt,
} from '../../src/runtime/convex/upload/upload-queue-state'

interface TestItem {
  id: string
  file: File
  mutationArgs?: { id: string }
  status: 'queued' | 'pending' | 'success' | 'error' | 'cancelled'
  progress: number
  loadedBytes: number
  totalBytes: number
  storageId?: string
  error: Error | null
  createdAt: number
  startedAt: number | null
  finishedAt: number | null
}

function makeFile(name: string, size: number): File {
  return new File(['x'.repeat(Math.max(1, size))], name, { type: 'application/octet-stream' })
}

describe('upload-queue-state', () => {
  it('derives queue counts, running state, and byte-weighted aggregate progress', () => {
    const items: TestItem[] = [
      {
        id: 'queued',
        file: makeFile('queued.bin', 20),
        status: 'queued',
        progress: 0,
        loadedBytes: 0,
        totalBytes: 20,
        error: null,
        createdAt: 1,
        startedAt: null,
        finishedAt: null,
      },
      {
        id: 'success',
        file: makeFile('success.bin', 10),
        status: 'success',
        progress: 100,
        loadedBytes: 10,
        totalBytes: 10,
        storageId: 'storage:success',
        error: null,
        createdAt: 1,
        startedAt: 2,
        finishedAt: 3,
      },
      {
        id: 'pending',
        file: makeFile('pending.bin', 70),
        status: 'pending',
        progress: 50,
        loadedBytes: 35,
        totalBytes: 70,
        error: null,
        createdAt: 1,
        startedAt: 2,
        finishedAt: null,
      },
    ]

    expect(deriveUploadQueueSummary(items, false)).toEqual({
      queuedCount: 1,
      pendingCount: 1,
      successCount: 1,
      errorCount: 0,
      cancelledCount: 0,
      isRunning: true,
      hasErrors: false,
      aggregateProgress: 45,
    })
  })

  it('creates queue items and applies pending, progress, success, error, and cancelled transitions', () => {
    let items = createUploadQueueItems<{ id: string }, TestItem>(
      [
        { file: makeFile('one.bin', 10), mutationArgs: { id: 'one' } },
        { file: makeFile('two.bin', 20), mutationArgs: { id: 'two' } },
      ],
      100,
      (() => {
        let n = 0
        return () => `item-${++n}`
      })(),
    )

    expect(items.map((item) => item.id)).toEqual(['item-1', 'item-2'])
    expect(getNextQueuedUploadItem(items)?.id).toBe('item-1')

    items = markUploadQueueItemPending(items, 'item-1', 200)
    const progress: UploadProgressInfo = { percent: 50, loaded: 5, total: 10 }
    items = applyUploadQueueProgress(items, 'item-1', progress)
    const success = settleUploadQueueItemSuccess(items, 'item-1', 'storage:one', 300)
    items = success.items
    const failure = settleUploadQueueItemError(items, 'item-2', new Error('boom'), 400)
    items = failure.items

    expect(success.updated?.status).toBe('success')
    expect(failure.updated?.status).toBe('error')
    expect(items[0]?.storageId).toBe('storage:one')
    expect(items[1]?.error?.message).toBe('boom')

    const cancelled = settleUploadQueueItemCancelled(items, 'item-1', 500)
    expect(cancelled.updated?.status).toBe('cancelled')
  })

  it('cancels only queued items, clears finished items, collects results, and resets halt state intentionally', () => {
    const baseItems: TestItem[] = [
      {
        id: 'queued',
        file: makeFile('queued.bin', 10),
        status: 'queued',
        progress: 0,
        loadedBytes: 0,
        totalBytes: 10,
        error: null,
        createdAt: 1,
        startedAt: null,
        finishedAt: null,
      },
      {
        id: 'pending',
        file: makeFile('pending.bin', 10),
        status: 'pending',
        progress: 50,
        loadedBytes: 5,
        totalBytes: 10,
        error: null,
        createdAt: 1,
        startedAt: 2,
        finishedAt: null,
      },
      {
        id: 'success',
        file: makeFile('success.bin', 10),
        status: 'success',
        progress: 100,
        loadedBytes: 10,
        totalBytes: 10,
        storageId: 'storage:success',
        error: null,
        createdAt: 1,
        startedAt: 2,
        finishedAt: 3,
      },
    ]

    const cancelled = cancelQueuedUploadItems(baseItems, 99)
    expect(cancelled.cancelledIds).toEqual(['queued'])
    expect(cancelled.items[0]?.status).toBe('cancelled')
    expect(cancelled.items[1]?.status).toBe('pending')

    expect(clearFinishedUploadItems(cancelled.items).map((item) => item.id)).toEqual(['pending'])

    const results = collectUploadQueueResults([
      { status: 'fulfilled', value: 'a' },
      { status: 'rejected', reason: new Error('bad') },
    ])
    expect(results.storageIds).toEqual(['a'])
    expect(results.failures).toHaveLength(1)
    expect(results.failures[0]?.message).toBe('bad')

    expect(shouldResetUploadQueueHalt(true, 0)).toBe(true)
    expect(shouldResetUploadQueueHalt(true, 1)).toBe(false)
    expect(shouldResetUploadQueueHalt(false, 0)).toBe(false)
  })
})
