import { describe, expect, it } from 'vitest'

import {
  buildAuthSnapshot,
  createAuthChangedPayload,
  hasAuthSnapshotChanged,
  isCurrentAuthOperation,
} from '../../src/runtime/auth/client/auth-engine-state'

describe('auth-engine-state', () => {
  it('builds authenticated and unauthenticated snapshots consistently', () => {
    const user = { id: 'user-a', name: 'A', email: 'a@test.com' }

    expect(buildAuthSnapshot('token', user)).toEqual({
      isAuthenticated: true,
      user,
      userId: 'user-a',
    })

    expect(buildAuthSnapshot(null, user)).toEqual({
      isAuthenticated: false,
      user: null,
      userId: null,
    })
  })

  it('detects snapshot changes only when auth status or identity changes', () => {
    const alice = buildAuthSnapshot('token-a', {
      id: 'alice',
      name: 'Alice',
      email: 'alice@test.com',
    })
    const sameAlice = buildAuthSnapshot('token-b', {
      id: 'alice',
      name: 'Alice 2',
      email: 'alice2@test.com',
    })
    const bob = buildAuthSnapshot('token-c', {
      id: 'bob',
      name: 'Bob',
      email: 'bob@test.com',
    })
    const anonymous = buildAuthSnapshot(null, null)

    expect(hasAuthSnapshotChanged(alice, sameAlice)).toBe(false)
    expect(hasAuthSnapshotChanged(alice, bob)).toBe(true)
    expect(hasAuthSnapshotChanged(alice, anonymous)).toBe(true)
  })

  it('creates auth-changed payloads and validates current operation ids', () => {
    const previous = buildAuthSnapshot('token-a', {
      id: 'alice',
      name: 'Alice',
      email: 'alice@test.com',
    })
    const next = buildAuthSnapshot('token-b', {
      id: 'bob',
      name: 'Bob',
      email: 'bob@test.com',
    })

    expect(createAuthChangedPayload(previous, next)).toEqual({
      isAuthenticated: true,
      previousIsAuthenticated: true,
      user: expect.objectContaining({ id: 'bob' }),
      previousUser: expect.objectContaining({ id: 'alice' }),
    })

    expect(isCurrentAuthOperation(4, 4)).toBe(true)
    expect(isCurrentAuthOperation(4, 5)).toBe(false)
  })
})
