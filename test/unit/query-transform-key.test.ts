import { describe, expect, it } from 'vitest'

import {
  getTransformedAsyncDataKeyId,
  getTransformedAsyncDataKeySuffix,
} from '../../src/runtime/utils/query-transform-key'

describe('query transform async-data keys', () => {
  it('returns no suffix when there is no transform', () => {
    expect(getTransformedAsyncDataKeySuffix()).toBe('')
    expect(getTransformedAsyncDataKeySuffix(null)).toBe('')
  })

  it('derives deterministic ids from transform source text', () => {
    const first = (input: unknown) => input
    const second = (input: unknown) => input

    expect(getTransformedAsyncDataKeyId(first)).toBe(getTransformedAsyncDataKeyId(first))
    expect(getTransformedAsyncDataKeyId(first)).toBe(getTransformedAsyncDataKeyId(second))
  })

  it('uses different ids for different transform source text', () => {
    const first = (input: unknown) => input
    const second = (input: unknown) => ({ value: input })

    expect(getTransformedAsyncDataKeyId(first)).not.toBe(getTransformedAsyncDataKeyId(second))
    expect(getTransformedAsyncDataKeySuffix(first)).toBe(
      `:transformed:${getTransformedAsyncDataKeyId(first)}`,
    )
  })
})
