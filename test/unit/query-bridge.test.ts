import { describe, expect, it } from 'vitest'

import {
  commitQueryBridgeData,
  commitQueryBridgeError,
  createQueryBridge,
  subscribeQueryBridge,
} from '../../src/runtime/utils/convex-cache'

describe('query subscription bridge', () => {
  it('commits raw data, marks data available, and clears errors', () => {
    const bridge = createQueryBridge()
    const error = new Error('stale')

    commitQueryBridgeError(bridge, error)
    commitQueryBridgeData(bridge, { count: 1 })

    expect(bridge.snapshot.data).toEqual({ hasData: true, rawData: { count: 1 } })
    expect(bridge.snapshot.error).toBeNull()
  })

  it('commits errors without replacing the current raw data', () => {
    const bridge = createQueryBridge()
    const error = new Error('boom')

    commitQueryBridgeData(bridge, ['a'])
    commitQueryBridgeError(bridge, error)

    expect(bridge.snapshot.data).toEqual({ hasData: true, rawData: ['a'] })
    expect(bridge.snapshot.error).toBe(error)
  })

  it('notifies listeners immediately, on commits, and stops after unsubscribe', () => {
    const bridge = createQueryBridge()
    const snapshots: unknown[] = []

    const unsubscribe = subscribeQueryBridge(bridge, (snapshot) => {
      snapshots.push(snapshot)
    })

    commitQueryBridgeData(bridge, { count: 1 })
    unsubscribe()
    commitQueryBridgeData(bridge, { count: 2 })

    expect(snapshots).toEqual([
      { data: { hasData: false, rawData: undefined }, error: null },
      { data: { hasData: true, rawData: { count: 1 } }, error: null },
    ])
  })
})
