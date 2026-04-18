import { describe, expect, it } from 'vitest'

import { getQueryKey } from '../../src/runtime/utils/convex-shared'
import { stripObservationEnvelope, withObservationEnvelope } from '../../src/runtime/utils/observability'

describe('query observability cache boundary', () => {
  it('changes the local query key when only __trellis changes', () => {
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
    expect(getQueryKey(query, argsA)).not.toBe(getQueryKey(query, argsB))
  })
})
