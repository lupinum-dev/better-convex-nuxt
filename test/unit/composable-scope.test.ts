import { describe, expect, it } from 'vitest'

import { assertConvexComposableScope } from '../../src/runtime/utils/composable-scope'

describe('assertConvexComposableScope', () => {
  it('throws for useConvexQuery when on client without scope', () => {
    expect(() => assertConvexComposableScope('useConvexQuery', true, undefined)).toThrow(
      '[useConvexQuery] Must be called within component setup/effect scope. For middleware/plugins use useConvexCall (client) or serverConvexQuery (server).',
    )
  })

  it('throws for useConvexPaginatedQuery when on client without scope', () => {
    expect(() => assertConvexComposableScope('useConvexPaginatedQuery', true, undefined)).toThrow(
      '[useConvexPaginatedQuery] Must be called within component setup/effect scope. For middleware/plugins use useConvexCall (client) or serverConvexQuery (server).',
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
