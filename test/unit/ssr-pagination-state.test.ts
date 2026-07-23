import { describe, expect, it } from 'vitest'

import { computeSsrPaginationStatus } from '../../src/runtime/utils/ssr-pagination-state'

describe('SSR pagination status', () => {
  it.each([
    {
      name: 'explicit skip',
      input: { execution: 'idle', hasError: false, pending: false, hasPage: false },
      expected: 'idle',
    },
    {
      name: 'authentication failure',
      input: { execution: 'error', hasError: false, pending: false, hasPage: false },
      expected: 'error',
    },
    {
      name: 'transport failure',
      input: { execution: 'execute', hasError: true, pending: false, hasPage: false },
      expected: 'error',
    },
    {
      name: 'authentication settlement',
      input: { execution: 'wait', hasError: false, pending: false, hasPage: false },
      expected: 'loading-first-page',
    },
    {
      name: 'first page loading',
      input: { execution: 'execute', hasError: false, pending: true, hasPage: false },
      expected: 'loading-first-page',
    },
    {
      name: 'ready page',
      input: { execution: 'execute', hasError: false, pending: false, hasPage: true },
      expected: 'ready',
    },
    {
      name: 'exhausted page',
      input: {
        execution: 'execute',
        hasError: false,
        pending: false,
        hasPage: true,
        isDone: true,
      },
      expected: 'exhausted',
    },
  ] as const)('$name has one coherent public state', ({ input, expected }) => {
    expect(
      computeSsrPaginationStatus({
        hasInitialData: false,
        isDone: false,
        ...input,
      }),
    ).toBe(expected)
  })

  it('keeps explicit initial data ready when no SSR page exists', () => {
    expect(
      computeSsrPaginationStatus({
        execution: 'execute',
        hasError: false,
        pending: false,
        hasPage: false,
        hasInitialData: true,
        isDone: false,
      }),
    ).toBe('ready')
  })
})
