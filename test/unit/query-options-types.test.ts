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

describe('query option type contracts', () => {
  it('uses initialData and skip args instead of legacy option aliases', () => {
    expect(true).toBe(true)
  })
})
