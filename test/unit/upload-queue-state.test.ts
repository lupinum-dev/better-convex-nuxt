import { describe, expect, it } from 'vitest'

import {
  computeUploadQueueAggregateProgress,
  countUploadQueueItems,
  normalizeUploadQueueEnqueueInput,
  type UploadQueueItem,
  type UploadQueueItemStatus,
} from '../../src/runtime/utils/upload-queue-state'

function file(size: number): File {
  return new File([size > 0 ? 'x'.repeat(size) : ''], 'upload.bin')
}

function item(
  status: UploadQueueItemStatus,
  overrides: Partial<UploadQueueItem> = {},
): UploadQueueItem {
  return {
    id: crypto.randomUUID(),
    file: file(10),
    status,
    progress: 0,
    loadedBytes: 0,
    totalBytes: 10,
    error: null,
    createdAt: 1,
    startedAt: null,
    finishedAt: null,
    ...overrides,
  }
}

describe('upload queue state helpers', () => {
  it('normalizes a single File with default mutation args', () => {
    const uploadFile = file(10)

    expect(normalizeUploadQueueEnqueueInput(uploadFile, { folder: 'docs' })).toEqual([
      { file: uploadFile, mutationArgs: { folder: 'docs' } },
    ])
  })

  it('normalizes File arrays and item arrays while preserving per-item args', () => {
    const first = file(10)
    const second = file(20)

    expect(normalizeUploadQueueEnqueueInput([first, second], { folder: 'shared' })).toEqual([
      { file: first, mutationArgs: { folder: 'shared' } },
      { file: second, mutationArgs: { folder: 'shared' } },
    ])

    expect(
      normalizeUploadQueueEnqueueInput(
        [{ file: first, mutationArgs: { folder: 'first' } }, { file: second }],
        { folder: 'fallback' },
      ),
    ).toEqual([
      { file: first, mutationArgs: { folder: 'first' } },
      { file: second, mutationArgs: { folder: 'fallback' } },
    ])
  })

  it('rejects unsupported enqueue input shapes', () => {
    expect(() => normalizeUploadQueueEnqueueInput([{ file: 'not-a-file' }] as never)).toThrow(
      /valid File/,
    )

    expect(() => normalizeUploadQueueEnqueueInput({} as never)).toThrow(/Unsupported/)
  })

  it('counts items by status', () => {
    const items = [
      item('queued'),
      item('pending'),
      item('pending'),
      item('success'),
      item('error'),
      item('cancelled'),
    ]

    expect(countUploadQueueItems(items, 'queued')).toBe(1)
    expect(countUploadQueueItems(items, 'pending')).toBe(2)
    expect(countUploadQueueItems(items, 'success')).toBe(1)
    expect(countUploadQueueItems(items, 'error')).toBe(1)
    expect(countUploadQueueItems(items, 'cancelled')).toBe(1)
  })

  it('computes byte-weighted progress across queued, pending, and successful items', () => {
    const items = [
      item('success', { file: file(10), totalBytes: 10, loadedBytes: 10 }),
      item('pending', { file: file(90), totalBytes: 90, loadedBytes: 45 }),
      item('queued', { file: file(100), totalBytes: 100, loadedBytes: 100 }),
    ]

    expect(computeUploadQueueAggregateProgress(items)).toBe(27)
  })

  it('treats halted items settled to cancelled as distinct from queued (F-32)', () => {
    // useConvexUploadQueue settles still-queued items to 'cancelled' when the
    // queue halts after an error (continueOnError: false), specifically so a
    // later enqueue() cannot mistake them for still-pending work and resume
    // them. countUploadQueueItems must keep these statuses mutually exclusive.
    const items = [item('cancelled'), item('cancelled'), item('queued')]

    expect(countUploadQueueItems(items, 'cancelled')).toBe(2)
    expect(countUploadQueueItems(items, 'queued')).toBe(1)
  })

  it('returns zero for empty or all-zero active work and one hundred for finished zero-byte work', () => {
    expect(computeUploadQueueAggregateProgress([])).toBe(0)
    expect(
      computeUploadQueueAggregateProgress([
        item('pending', { file: file(0), totalBytes: 0, loadedBytes: 0 }),
      ]),
    ).toBe(0)
    expect(
      computeUploadQueueAggregateProgress([
        item('success', { file: file(0), totalBytes: 0, loadedBytes: 0 }),
      ]),
    ).toBe(100)
  })
})
