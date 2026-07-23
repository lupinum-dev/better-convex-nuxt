import type { FunctionReference, PaginationOptions, PaginationResult } from 'convex/server'
import { describe, expectTypeOf, it } from 'vitest'

declare const useConvexQuery: typeof import('../../packages/vue/src/use-query').useConvexQuery
declare const useConvexPaginatedQuery: typeof import('../../packages/vue/src/use-paginated-query').useConvexPaginatedQuery

declare const requiredQuery: FunctionReference<'query', 'public', { id: string }, string>
declare const requiredPaginatedQuery: FunctionReference<
  'query',
  'public',
  { owner: string; paginationOpts: PaginationOptions },
  PaginationResult<string>
>
declare const ordinaryQuery: FunctionReference<'query', 'public', { owner: string }, string[]>
declare const wrongPaginatedResult: FunctionReference<
  'query',
  'public',
  { paginationOpts: PaginationOptions },
  string[]
>

function typeContracts() {
  void useConvexQuery(requiredQuery, { id: 'note' })
  // @ts-expect-error required query arguments cannot be omitted
  void useConvexQuery(requiredQuery)

  void useConvexPaginatedQuery(requiredPaginatedQuery, { owner: 'alice' })
  // @ts-expect-error required paginated query arguments cannot be omitted
  void useConvexPaginatedQuery(requiredPaginatedQuery)
  // @ts-expect-error ordinary queries are not paginated query references
  void useConvexPaginatedQuery(ordinaryQuery, { owner: 'alice' })
  // @ts-expect-error paginated references must return a pagination result
  void useConvexPaginatedQuery(wrongPaginatedResult, {})
}

describe('better-convex-vue query type contracts', () => {
  it('requires arguments and accepts only paginated references for pagination', () => {
    expectTypeOf(typeContracts).toBeFunction()
  })
})
