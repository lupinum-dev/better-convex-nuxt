import { describe, expect, it } from 'vitest'

import type { UseConvexActionReturn } from '../../src/runtime/composables/useConvexAction'
import type { UseConvexMutationReturn } from '../../src/runtime/composables/useConvexMutation'
import type { CallResult } from '../../src/runtime/utils/call-result'

type IsEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Assert<T extends true> = T
type HasKey<T, K extends PropertyKey> = K extends keyof T ? true : false

type MutationReturn = UseConvexMutationReturn<{ id: string }, { id: string }>
type ActionReturn = UseConvexActionReturn<{ id: string }, { id: string }>

type _MutationNestedSafe = Assert<
  IsEqual<
    Awaited<
      ReturnType<UseConvexMutationReturn<{ id: string }, CallResult<{ id: string }>>['safe']>
    >,
    CallResult<CallResult<{ id: string }>>
  >
>

type _MutationCallable = Assert<IsEqual<Awaited<ReturnType<MutationReturn>>, { id: string }>>
type _MutationHasNoExecute = Assert<IsEqual<HasKey<MutationReturn, 'execute'>, false>>
type _MutationHasNoExecuteSafe = Assert<IsEqual<HasKey<MutationReturn, 'executeSafe'>, false>>

type _ActionNestedSafe = Assert<
  IsEqual<
    Awaited<ReturnType<UseConvexActionReturn<{ id: string }, CallResult<{ id: string }>>['safe']>>,
    CallResult<CallResult<{ id: string }>>
  >
>

type _ActionCallable = Assert<IsEqual<Awaited<ReturnType<ActionReturn>>, { id: string }>>
type _ActionHasNoExecute = Assert<IsEqual<HasKey<ActionReturn, 'execute'>, false>>
type _ActionHasNoExecuteSafe = Assert<IsEqual<HasKey<ActionReturn, 'executeSafe'>, false>>

describe('CallResult type contracts', () => {
  it('keeps nested safe result typing for domain CallResult endpoints', () => {
    expect(true).toBe(true)
  })
})
