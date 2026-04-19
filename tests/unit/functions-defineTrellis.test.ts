import { describe, expect, it } from 'vitest'
import { v } from 'convex/values'

import { open } from '../../src/runtime/auth'
import { defineTrellis } from '../../src/runtime/functions'
import { defineOperation } from '../../src/runtime/functions/define-operation'

describe('defineTrellis', () => {
  it('exposes direct protected builders and raw escape hatches', () => {
    const builder = () => null as never

    const runtime = defineTrellis({
      query: builder,
      mutation: builder,
    })

    expect(runtime.query).toBeTypeOf('function')
    expect(runtime.mutation).toBeTypeOf('function')
    expect(runtime.raw.query).toBeTypeOf('function')
    expect(runtime.raw.mutation).toBeTypeOf('function')
    expect(runtime).not.toHaveProperty('app')
    expect(runtime).not.toHaveProperty('publicQuery')
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

  it('forwards action builders when provided', () => {
    const builder = () => null as never

    const runtime = defineTrellis({
      query: builder,
      mutation: builder,
      action: builder,
    })

    expect(runtime.action).toBeTypeOf('function')
    expect(runtime.raw.action).toBeTypeOf('function')
  })

  it('rejects destructive operation registration when destructiveSafety is missing', () => {
    const builder = ((definition: unknown) => definition) as never

    const runtime = defineTrellis({
      query: builder,
      mutation: builder,
    })

    const destructiveOp = defineOperation({
      id: 'tests.destroy',
      kind: 'destructive',
      args: {
        id: v.string(),
      },
      guard: open,
      preview: async () => ({
        display: { summary: 'Destroy test record' },
        confirm: { operation: 'tests.destroy' },
      }),
      handler: async () => null,
    })

    expect(() => runtime.mutation(destructiveOp)).toThrow(/destructiveSafety/)
  })
})
