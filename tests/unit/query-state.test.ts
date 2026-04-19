import { describe, expect, it } from 'vitest'

import {
  createSkippedQueryCacheKey,
  resolveQueryDefaultValue,
  shouldMarkQueryDataAsStale,
  shouldPersistLastSettledQuery,
} from '../../src/runtime/convex/query/query-state'

describe('query-state', () => {
  it('creates stable skipped cache keys and prefers previous settled data over fallback defaults', () => {
    expect(createSkippedQueryCacheKey('tasks:list')).toBe('convex:skipped:tasks:list')

    expect(
      resolveQueryDefaultValue({
        keepPreviousData: true,
        lastSettledData: ['previous'],
        fallback: () => ['fallback'],
      }),
    ).toEqual(['previous'])

    expect(
      resolveQueryDefaultValue({
        keepPreviousData: false,
        lastSettledData: ['previous'],
        fallback: () => ['fallback'],
      }),
    ).toEqual(['fallback'])
  })

  it('persists settled query data only after a non-pending result for real args', () => {
    expect(
      shouldPersistLastSettledQuery({
        value: ['notes'],
        pending: false,
        argsHash: 'hash-a',
      }),
    ).toBe(true)

    expect(
      shouldPersistLastSettledQuery({
        value: null,
        pending: false,
        argsHash: 'hash-a',
      }),
    ).toBe(false)

    expect(
      shouldPersistLastSettledQuery({
        value: ['notes'],
        pending: true,
        argsHash: 'hash-a',
      }),
    ).toBe(false)

    expect(
      shouldPersistLastSettledQuery({
        value: ['notes'],
        pending: false,
        argsHash: null,
      }),
    ).toBe(false)
  })

  it('marks query data stale only during keepPreviousData transitions before the first current-args result', () => {
    expect(
      shouldMarkQueryDataAsStale({
        keepPreviousData: true,
        isSkipped: false,
        pending: true,
        hasError: false,
        currentArgsHash: 'hash-b',
        lastSettledArgsHash: 'hash-a',
        lastReceivedArgsHash: 'hash-a',
        hasData: true,
      }),
    ).toBe(true)

    expect(
      shouldMarkQueryDataAsStale({
        keepPreviousData: true,
        isSkipped: false,
        pending: true,
        hasError: false,
        currentArgsHash: 'hash-b',
        lastSettledArgsHash: 'hash-a',
        lastReceivedArgsHash: 'hash-b',
        hasData: true,
      }),
    ).toBe(false)

    expect(
      shouldMarkQueryDataAsStale({
        keepPreviousData: false,
        isSkipped: false,
        pending: true,
        hasError: false,
        currentArgsHash: 'hash-b',
        lastSettledArgsHash: 'hash-a',
        lastReceivedArgsHash: 'hash-a',
        hasData: true,
      }),
    ).toBe(false)
  })
})
