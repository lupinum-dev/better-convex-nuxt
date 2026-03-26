import { describe, expect, it } from 'vitest'

import { ConvexError, toCallResult, type CallResult } from '../../src/runtime/utils/call-result'

type IsEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Assert<T extends true> = T

type _NestedCallResult = Assert<
  IsEqual<
    Awaited<ReturnType<typeof toCallResult<CallResult<{ id: string }>>>>,
    CallResult<CallResult<{ id: string }>>
  >
>

describe('CallResult type contracts', () => {
  it('toCallResult wraps domain CallResult values without flattening them', async () => {
    const domainResult: CallResult<{ id: string }> = {
      ok: false,
      error: new ConvexError('Domain validation failed', { code: 'DOMAIN_VALIDATION' }),
    }
    const wrapped = await toCallResult(async () => domainResult)

    expect(wrapped.ok).toBe(true)
    if (!wrapped.ok) throw new Error('Expected outer CallResult to be ok')
    expect(wrapped.data).toEqual(domainResult)
  })
})
