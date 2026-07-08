import type { FunctionReference, PaginationOptions, PaginationResult } from 'convex/server'
import { describe, expect, it } from 'vitest'
import type { ComputedRef } from 'vue'

import type {
  ConvexPaginatedQueryArgs,
  UseConvexPaginatedQueryOptions,
} from '../../src/runtime/composables/useConvexPaginatedQuery'
import type {
  ConvexQueryArgs,
  UseConvexQueryData,
  UseConvexQueryOptions,
} from '../../src/runtime/composables/useConvexQuery'

// Type-only bindings for the composable functions. `typeof import(...)` is
// erased at compile time, so these never trigger a runtime `#imports` resolve
// in the node/unit vitest environment while still type-checking call arity.
declare const useConvexQuery: typeof import('../../src/runtime/composables/useConvexQuery').useConvexQuery
declare const useConvexUser: typeof import('../../src/runtime/composables/useConvexUser').useConvexUser
declare const useConvexPaginatedQuery: typeof import('../../src/runtime/composables/useConvexPaginatedQuery').useConvexPaginatedQuery
declare const defineSharedConvexQuery: typeof import('../../src/runtime/composables/defineSharedConvexQuery').defineSharedConvexQuery

type Assert<T extends true> = T
type HasKey<T, K extends PropertyKey> = K extends keyof T ? true : false
type IsEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false

type QueryOptions = UseConvexQueryOptions<string[]>
type PaginatedOptions = UseConvexPaginatedQueryOptions<{ id: string }>
type QueryArgs = ConvexQueryArgs<{ id: string }>
type PaginatedArgs = ConvexPaginatedQueryArgs<{ id: string }>
type QueryData = UseConvexQueryData<string>

type _QueryUsesInitialData = Assert<
  IsEqual<QueryOptions['initialData'], string[] | (() => string[] | undefined) | undefined>
>
type _PaginatedUsesInitialData = Assert<
  IsEqual<PaginatedOptions['initialData'], { id: string }[] | (() => { id: string }[]) | undefined>
>

type _QueryHasNoDefaultOption = Assert<IsEqual<HasKey<QueryOptions, 'default'>, false>>
type _PaginatedHasNoDefaultOption = Assert<IsEqual<HasKey<PaginatedOptions, 'default'>, false>>
type _QueryHasNoEnabledOption = Assert<IsEqual<HasKey<QueryOptions, 'enabled'>, false>>
type _PaginatedHasNoEnabledOption = Assert<IsEqual<HasKey<PaginatedOptions, 'enabled'>, false>>
type _QueryHasNoDeepUnrefArgsOption = Assert<IsEqual<HasKey<QueryOptions, 'deepUnrefArgs'>, false>>
type _PaginatedHasNoDeepUnrefArgsOption = Assert<
  IsEqual<HasKey<PaginatedOptions, 'deepUnrefArgs'>, false>
>
type _QueryHasAuthOption = Assert<IsEqual<QueryOptions['auth'], 'auto' | 'none' | undefined>>
type _PaginatedHasAuthOption = Assert<
  IsEqual<PaginatedOptions['auth'], 'auto' | 'none' | undefined>
>
type _QueryArgsUseOnlySkipSentinel = Assert<IsEqual<QueryArgs, { id: string } | 'skip'>>
type _PaginatedArgsUseOnlySkipSentinel = Assert<IsEqual<PaginatedArgs, { id: string } | 'skip'>>
type _QueryDataIsReadonlyComputed = Assert<IsEqual<QueryData['data'], ComputedRef<string | null>>>

// ============================================================================
// Negative-space call-arity contracts (F-5 / F-23), mirrored against `src`.
// These calls must NOT compile; reverting the conditional rest-tuple makes the
// `@ts-expect-error` lines fail `test:types`. `_arityContracts` is never called.
// ============================================================================

declare const noArgQuery: FunctionReference<'query', 'public', Record<string, never>, string[]>
declare const reqArgQuery: FunctionReference<'query', 'public', { id: string }, string>
declare const noArgPaginated: FunctionReference<
  'query',
  'public',
  { paginationOpts: PaginationOptions },
  PaginationResult<string>
>
declare const reqArgPaginated: FunctionReference<
  'query',
  'public',
  { owner: string; paginationOpts: PaginationOptions },
  PaginationResult<string>
>

async function _arityContracts() {
  // --- useConvexQuery ---
  void useConvexQuery(noArgQuery) // no-arg query accepts zero args
  void useConvexQuery(reqArgQuery, { id: 'x' }) // correct args compile
  void useConvexQuery(reqArgQuery, 'skip') // 'skip' still compiles
  // @ts-expect-error required args must not be omittable (F-5)
  void useConvexQuery(reqArgQuery)
  // @ts-expect-error wrong arg shape must not compile (F-5)
  void useConvexQuery(reqArgQuery, { wrong: 1 })

  // --- useConvexPaginatedQuery ---
  void useConvexPaginatedQuery(noArgPaginated) // no extra args accepts zero args
  void useConvexPaginatedQuery(reqArgPaginated, { owner: 'x' }) // correct extra args compile
  // @ts-expect-error required paginated args must not be omittable (F-5)
  void useConvexPaginatedQuery(reqArgPaginated)
  // @ts-expect-error wrong paginated arg shape must not compile (F-5)
  void useConvexPaginatedQuery(reqArgPaginated, { wrong: 1 })

  // --- useConvexUser ---
  void useConvexUser(noArgQuery) // no-arg query accepts zero args
  // @ts-expect-error required args must not be omittable (F-5)
  void useConvexUser(reqArgQuery)
  // @ts-expect-error wrong arg shape must not compile (F-5)
  void useConvexUser(reqArgQuery, { wrong: 1 })

  // --- defineSharedConvexQuery: args field conditionally required ---
  defineSharedConvexQuery({ key: 'k1', query: noArgQuery }) // no-arg may omit args
  defineSharedConvexQuery({ key: 'k2', query: reqArgQuery, args: { id: 'x' } })
  // @ts-expect-error required args field must not be omittable (F-5)
  defineSharedConvexQuery({ key: 'k3', query: reqArgQuery })
  // @ts-expect-error wrong args field shape must not compile (F-5)
  defineSharedConvexQuery({ key: 'k4', query: reqArgQuery, args: { wrong: 1 } })
}

describe('query option type contracts', () => {
  it('uses initialData and skip args instead of legacy option aliases', () => {
    expect(true).toBe(true)
  })
})
