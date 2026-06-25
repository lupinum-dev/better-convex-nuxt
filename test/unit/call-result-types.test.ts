import type { FunctionReference } from 'convex/server'
import { describe, expect, it } from 'vitest'

import type { UseConvexActionReturn } from '../../src/runtime/composables/useConvexAction'
import type { UseConvexCallReturn } from '../../src/runtime/composables/useConvexCall'
import type { UseConvexMutationReturn } from '../../src/runtime/composables/useConvexMutation'
import type { CallResult } from '../../src/runtime/utils/call-result'

type IsEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Assert<T extends true> = T
type HasKey<T, K extends PropertyKey> = K extends keyof T ? true : false

type ConvexArgs = Record<string, unknown>
type MutationRef<Args extends ConvexArgs, Result> = FunctionReference<
  'mutation',
  'public',
  Args,
  Result
>
type ActionRef<Args extends ConvexArgs, Result> = FunctionReference<
  'action',
  'public',
  Args,
  Result
>
type QueryRef<Args extends ConvexArgs, Result> = FunctionReference<'query', 'public', Args, Result>
type Argless = Record<string, never>

type MutationReturn = UseConvexMutationReturn<MutationRef<{ id: string }, { id: string }>>
type ActionReturn = UseConvexActionReturn<ActionRef<{ id: string }, { id: string }>>

type _MutationNestedSafe = Assert<
  IsEqual<
    Awaited<
      ReturnType<
        UseConvexMutationReturn<MutationRef<{ id: string }, CallResult<{ id: string }>>>['safe']
      >
    >,
    CallResult<CallResult<{ id: string }>>
  >
>

type _MutationCallable = Assert<IsEqual<Awaited<ReturnType<MutationReturn>>, { id: string }>>
type _MutationCallableArgs = Assert<IsEqual<Parameters<MutationReturn>, [args: { id: string }]>>
type _ArglessMutationCallableArgs = Assert<
  IsEqual<Parameters<UseConvexMutationReturn<MutationRef<Argless, string>>>, [args?: Argless]>
>
type _MutationHasNoExecute = Assert<IsEqual<HasKey<MutationReturn, 'execute'>, false>>
type _MutationHasNoExecuteSafe = Assert<IsEqual<HasKey<MutationReturn, 'executeSafe'>, false>>

type _ActionNestedSafe = Assert<
  IsEqual<
    Awaited<
      ReturnType<
        UseConvexActionReturn<ActionRef<{ id: string }, CallResult<{ id: string }>>>['safe']
      >
    >,
    CallResult<CallResult<{ id: string }>>
  >
>

type _ActionCallable = Assert<IsEqual<Awaited<ReturnType<ActionReturn>>, { id: string }>>
type _ActionCallableArgs = Assert<IsEqual<Parameters<ActionReturn>, [args: { id: string }]>>
type _ArglessActionCallableArgs = Assert<
  IsEqual<Parameters<UseConvexActionReturn<ActionRef<Argless, string>>>, [args?: Argless]>
>
type _ActionHasNoExecute = Assert<IsEqual<HasKey<ActionReturn, 'execute'>, false>>
type _ActionHasNoExecuteSafe = Assert<IsEqual<HasKey<ActionReturn, 'executeSafe'>, false>>

function assertUseConvexCallReturnTypes(
  calls: UseConvexCallReturn,
  queryRef: QueryRef<{ id: string }, { id: string }>,
  arglessQueryRef: QueryRef<Argless, string>,
  mutationRef: MutationRef<{ id: string }, { ok: true }>,
) {
  const _queryPromise = calls.query(queryRef, { id: '1' })
  type _CallQueryReturn = Assert<IsEqual<Awaited<typeof _queryPromise>, { id: string }>>

  const _arglessQueryPromise = calls.query(arglessQueryRef)
  type _CallArglessQueryReturn = Assert<IsEqual<Awaited<typeof _arglessQueryPromise>, string>>

  const _safeMutationPromise = calls.mutationSafe(mutationRef, { id: '1' })
  type _CallSafeReturn = Assert<
    IsEqual<Awaited<typeof _safeMutationPromise>, CallResult<{ ok: true }>>
  >
}
void assertUseConvexCallReturnTypes

describe('CallResult type contracts', () => {
  it('keeps nested safe result typing for domain CallResult endpoints', () => {
    expect(true).toBe(true)
  })
})
