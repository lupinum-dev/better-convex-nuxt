import { describe, expect, it } from 'vitest'

import { assertConvexComposableScope } from '../../src/runtime/utils/composable-scope'

describe('assertConvexComposableScope', () => {
  it('throws for useConvexQuery when on client without scope', () => {
    expect(() => assertConvexComposableScope('useConvexQuery', true, undefined)).toThrow(
      '[useConvexQuery] Must be called inside <script setup> or a component lifecycle hook. For middleware/plugins, use useConvex() directly or serverConvexQuery() on the server.',
    )
  })

  it('throws for useConvexPaginatedQuery when on client without scope', () => {
    expect(() => assertConvexComposableScope('useConvexPaginatedQuery', true, undefined)).toThrow(
      '[useConvexPaginatedQuery] Must be called inside <script setup> or a component lifecycle hook. For middleware/plugins, use useConvex() directly or serverConvexQuery() on the server.',
    )
  })

  it('does not throw when scope is available', () => {
    expect(() => assertConvexComposableScope('useConvexQuery', true, {})).not.toThrow()
  })

  it('does not throw on server even without scope', () => {
    expect(() =>
      assertConvexComposableScope('useConvexPaginatedQuery', false, undefined),
    ).not.toThrow()
  })
})
