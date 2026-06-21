import { describe, expect, it } from 'vitest'

import {
  commitQueryBridgeData,
  commitQueryBridgeError,
  createQueryBridge,
} from '../../src/runtime/utils/convex-cache'

describe('query subscription bridge', () => {
  it('commits raw data, marks data available, and clears errors', () => {
    const bridge = createQueryBridge()
    const error = new Error('stale')

    commitQueryBridgeError(bridge, error)
    commitQueryBridgeData(bridge, { count: 1 })

    expect(bridge.data.value).toEqual({ hasData: true, rawData: { count: 1 } })
    expect(bridge.error.value).toBeNull()
  })

  it('commits errors without replacing the current raw data', () => {
    const bridge = createQueryBridge()
    const error = new Error('boom')

    commitQueryBridgeData(bridge, ['a'])
    commitQueryBridgeError(bridge, error)

    expect(bridge.data.value).toEqual({ hasData: true, rawData: ['a'] })
    expect(bridge.error.value).toBe(error)
  })
})
