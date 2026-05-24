import { describe, expect, it } from 'vitest'

import {
  buildAuthSnapshot,
  createAuthChangedPayload,
  hasAuthSnapshotChanged,
  isCurrentAuthOperation,
} from '../../src/runtime/auth/client/auth-engine-state'

describe('auth-engine-state', () => {
  it('builds authenticated and unauthenticated snapshots consistently', () => {
    const user = { displayName: 'A', email: 'a@test.com' }

    expect(buildAuthSnapshot('token', user)).toEqual({
      isAuthenticated: true,
      user,
      tokenFingerprint: 'token',
    })

    expect(buildAuthSnapshot(null, user)).toEqual({
      isAuthenticated: false,
      user: null,
      tokenFingerprint: null,
    })
  })

  it('detects snapshot changes only when auth status or identity changes', () => {
    const alice = buildAuthSnapshot('token-a', {
      displayName: 'Alice',
      email: 'alice@test.com',
    })
    const sameAlice = buildAuthSnapshot('token-a', {
      displayName: 'Alice 2',
      email: 'alice2@test.com',
    })
    const bob = buildAuthSnapshot('token-c', {
      displayName: 'Bob',
      email: 'bob@test.com',
    })
    const anonymous = buildAuthSnapshot(null, null)

    expect(hasAuthSnapshotChanged(alice, sameAlice)).toBe(false)
    expect(hasAuthSnapshotChanged(alice, bob)).toBe(true)
    expect(hasAuthSnapshotChanged(alice, anonymous)).toBe(true)
  })

  it('creates auth-changed payloads and validates current operation ids', () => {
    const previous = buildAuthSnapshot('token-a', {
      displayName: 'Alice',
      email: 'alice@test.com',
    })
    const next = buildAuthSnapshot('token-b', {
      displayName: 'Bob',
      email: 'bob@test.com',
    })

    expect(createAuthChangedPayload(previous, next)).toEqual({
      isAuthenticated: true,
      previousIsAuthenticated: true,
      sessionUser: expect.objectContaining({ email: 'bob@test.com' }),
      previousSessionUser: expect.objectContaining({ email: 'alice@test.com' }),
    })

    expect(isCurrentAuthOperation(4, 4)).toBe(true)
    expect(isCurrentAuthOperation(4, 5)).toBe(false)
  })
})
