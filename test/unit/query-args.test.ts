import { describe, expect, it } from 'vitest'
import { ref } from 'vue'

import { isConvexArgsSkipped, normalizeConvexArgs } from '../../src/runtime/utils/query-args'

describe('query args normalization', () => {
  it('uses an empty object when no args parameter is provided', () => {
    expect(normalizeConvexArgs(undefined)).toEqual({})
  })

  it('preserves reactive skip sentinels and disabled states', () => {
    expect(normalizeConvexArgs(ref('skip'))).toBe('skip')
    expect(normalizeConvexArgs(() => null)).toBeNull()
    expect(normalizeConvexArgs(() => undefined)).toBeUndefined()

    expect(isConvexArgsSkipped('skip')).toBe(true)
    expect(isConvexArgsSkipped(null)).toBe(true)
    expect(isConvexArgsSkipped(undefined)).toBe(true)
    expect(isConvexArgsSkipped({})).toBe(false)
  })

  it('deeply unwraps nested refs', () => {
    const nested = {
      status: ref('active'),
      filter: {
        owner: ref('me'),
      },
    }

    expect(normalizeConvexArgs(nested)).toEqual({
      status: 'active',
      filter: {
        owner: 'me',
      },
    })
  })
})
