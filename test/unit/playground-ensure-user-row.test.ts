import { describe, expect, it } from 'vitest'

import { shouldEnsureUserRow } from '../../playground/composables/ensure-user-row-debug'

describe('playground ensure-user-row gating', () => {
  it('only bootstraps when auth exists but the app user row is still missing', () => {
    expect(shouldEnsureUserRow(null)).toBe(false)
    expect(shouldEnsureUserRow({
      _debug: { hasIdentity: true, hasUser: false, reason: 'user not found in DB, needs to be created' },
    })).toBe(true)
    expect(shouldEnsureUserRow({
      _debug: { hasIdentity: true, hasUser: true, reason: 'user not found in DB, needs to be created' },
    })).toBe(false)
    expect(shouldEnsureUserRow({
      _debug: { hasIdentity: true, hasUser: false, reason: 'different reason' },
    })).toBe(false)
  })
})
