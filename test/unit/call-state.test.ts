import { describe, expect, it } from 'vitest'

import { createConvexCallState } from '../../src/runtime/utils/call-state'

describe('createConvexCallState', () => {
  it('tracks pending, success, error, and reset state', () => {
    const state = createConvexCallState<string>()

    expect(state.status.value).toBe('idle')
    expect(state.pending.value).toBe(false)
    expect(state.data.value).toBeUndefined()
    expect(state.error.value).toBeNull()

    const first = state.start()
    expect(state.status.value).toBe('pending')
    expect(state.pending.value).toBe(true)

    expect(state.commitSuccess(first, 'ok')).toBe(true)
    expect(state.status.value).toBe('success')
    expect(state.pending.value).toBe(false)
    expect(state.data.value).toBe('ok')

    const second = state.start()
    const error = new Error('boom')
    expect(state.commitError(second, error)).toBe(true)
    expect(state.status.value).toBe('error')
    expect(state.error.value).toBe(error)
    expect(state.data.value).toBe('ok')

    state.reset()
    expect(state.status.value).toBe('idle')
    expect(state.pending.value).toBe(false)
    expect(state.data.value).toBeUndefined()
    expect(state.error.value).toBeNull()
  })

  it('rejects stale success and error commits after newer starts or reset', () => {
    const state = createConvexCallState<string>()

    const stale = state.start()
    const current = state.start()

    expect(state.commitSuccess(stale, 'stale')).toBe(false)
    expect(state.status.value).toBe('pending')
    expect(state.data.value).toBeUndefined()

    expect(state.commitError(stale, new Error('stale'))).toBe(false)
    expect(state.status.value).toBe('pending')
    expect(state.error.value).toBeNull()

    expect(state.commitSuccess(current, 'current')).toBe(true)
    expect(state.data.value).toBe('current')

    const resetStale = state.start()
    state.reset()

    expect(state.commitSuccess(resetStale, 'after-reset')).toBe(false)
    expect(state.commitError(resetStale, new Error('after-reset'))).toBe(false)
    expect(state.status.value).toBe('idle')
    expect(state.data.value).toBeUndefined()
    expect(state.error.value).toBeNull()
  })
})
