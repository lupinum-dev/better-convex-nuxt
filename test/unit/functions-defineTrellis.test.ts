import { describe, expect, it } from 'vitest'

import { defineTrellis } from '../../src/runtime/functions'

describe('defineTrellis', () => {
  it('exposes direct protected builders and raw escape hatches', () => {
    const builder = () => null as never

    const runtime = defineTrellis({
      query: builder,
      mutation: builder,
    })

    expect(runtime.query).toBeTypeOf('function')
    expect(runtime.mutation).toBeTypeOf('function')
    expect(runtime.publicQuery).toBe(runtime.query)
    expect(runtime.publicMutation).toBe(runtime.mutation)
    expect(runtime.raw.query).toBeTypeOf('function')
    expect(runtime.raw.mutation).toBeTypeOf('function')
    expect(runtime).not.toHaveProperty('app')
  })

  it('forwards internal builders when provided', () => {
    const builder = () => null as never

    const runtime = defineTrellis({
      query: builder,
      mutation: builder,
      internalQuery: builder,
      internalMutation: builder,
    })

    expect(runtime.internalQuery).toBeTypeOf('function')
    expect(runtime.internalMutation).toBeTypeOf('function')
  })
})
