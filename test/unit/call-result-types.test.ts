import { describe, expect, it } from 'vitest'

import type { UseConvexActionReturn } from '../../src/runtime/composables/useConvexAction'
import type { UseConvexMutationReturn } from '../../src/runtime/composables/useConvexMutation'
import type { CallResult } from '../../src/runtime/utils/call-result'

type IsEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Assert<T extends true> = T

type _MutationNestedSafe = Assert<
  IsEqual<
    Awaited<
      ReturnType<UseConvexMutationReturn<{ id: string }, CallResult<{ id: string }>>['executeSafe']>
    >,
    CallResult<CallResult<{ id: string }>>
  >
>

type _ActionNestedSafe = Assert<
  IsEqual<
    Awaited<
      ReturnType<UseConvexActionReturn<{ id: string }, CallResult<{ id: string }>>['executeSafe']>
    >,
    CallResult<CallResult<{ id: string }>>
  >
>

describe('CallResult type contracts', () => {
  it('keeps nested safe result typing for domain CallResult endpoints', () => {
    expect(true).toBe(true)
  })
})
