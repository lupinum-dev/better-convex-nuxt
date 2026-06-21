import { describe, expect, it } from 'vitest'

import {
  commitQueryBridgeData,
  commitQueryBridgeError,
  createQueryBridge,
} from '../../src/runtime/utils/convex-cache'

describe('query subscription bridge', () => {
  it('commits raw data, marks data available, clears errors, and increments data version', () => {
    const bridge = createQueryBridge()
    const error = new Error('stale')

    commitQueryBridgeError(bridge, error)
    commitQueryBridgeData(bridge, { count: 1 })

    expect(bridge.rawData).toEqual({ count: 1 })
    expect(bridge.hasRawData).toBe(true)
    expect(bridge.error).toBeNull()
    expect(bridge.dataVersion.value).toBe(1)
    expect(bridge.errorVersion.value).toBe(1)
  })

  it('commits errors without changing the current raw data version', () => {
    const bridge = createQueryBridge()
    const error = new Error('boom')

    commitQueryBridgeData(bridge, ['a'])
    commitQueryBridgeError(bridge, error)

    expect(bridge.rawData).toEqual(['a'])
    expect(bridge.hasRawData).toBe(true)
    expect(bridge.error).toBe(error)
    expect(bridge.dataVersion.value).toBe(1)
    expect(bridge.errorVersion.value).toBe(1)
  })
})
