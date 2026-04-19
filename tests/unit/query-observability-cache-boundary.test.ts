import { describe, expect, it } from 'vitest'

import { getQueryKey } from '../../src/runtime/convex/shared/convex-shared'
import { stripObservationEnvelope, withObservationEnvelope } from '../../src/runtime/observability'

describe('query observability cache boundary', () => {
  it('keeps the local query key stable when only __trellis changes', () => {
    const query = { _path: 'notes:list' } as never
    const businessArgs = { limit: 5 }
    const argsA = withObservationEnvelope(businessArgs, {
      correlationId: 'corr_a',
      originTransport: 'nuxt-server',
      requestId: 'req_a',
    })
    const argsB = withObservationEnvelope(businessArgs, {
      correlationId: 'corr_b',
      originTransport: 'nuxt-server',
      requestId: 'req_b',
    })

    expect(stripObservationEnvelope(argsA)).toEqual(businessArgs)
    expect(stripObservationEnvelope(argsB)).toEqual(businessArgs)
    expect(getQueryKey(query, argsA)).toBe(getQueryKey(query, argsB))
  })
})
