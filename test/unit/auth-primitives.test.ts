import { describe, expect, it } from 'vitest'

import {
  all,
  any,
  applyVisibility,
  can,
  defineVisibility,
  deny,
  guard,
  not,
  verifyKey,
} from '../../src/runtime/auth'

describe('auth primitives', () => {
  it('evaluates boolean composition helpers', () => {
    const actor = { role: 'member', userId: 'alice' }
    const hasRole = (...roles: string[]) => (value: typeof actor | null) => !!value && roles.includes(value.role)
    const owns = (resource: { ownerId: string }) => (value: typeof actor | null) => !!value && value.userId === resource.ownerId

    expect(can(actor, all(hasRole('member'), owns({ ownerId: 'alice' })))).toBe(true)
    expect(can(actor, any(hasRole('admin'), owns({ ownerId: 'alice' })))).toBe(true)
    expect(can(actor, not(hasRole('admin')))).toBe(true)
  })

  it('throws forbidden errors from guard()', () => {
    expect(() => guard(null, 'Read dashboard', false)).toThrow(/Forbidden: Read dashboard/)
  })

  it('throws forbidden errors from deny()', () => {
    expect(() => deny('No dashboard for you.')).toThrow(/No dashboard for you/)
  })

  it('fails closed in can() when checks throw', () => {
    expect(can({}, () => {
      throw new Error('boom')
    })).toBe(false)
  })

  it('verifies keys in constant-time-compatible shape', () => {
    expect(verifyKey('abc', 'abc')).toBe(true)
    expect(verifyKey('abc', 'def')).toBe(false)
    expect(verifyKey('', 'def')).toBe(false)
  })

  it('applies visibility queries and arrays', async () => {
    const visibility = defineVisibility(async () => [{ _id: '1' }])
    const rows = await applyVisibility(visibility, { userId: 'a' }, {} as never)
    expect(rows).toEqual([{ _id: '1' }])

    const queryVisibility = defineVisibility(async () => ({
      collect: async () => [{ _id: '2' }],
    }))
    const collected = await applyVisibility(queryVisibility, { userId: 'a' }, {} as never)
    expect(collected).toEqual([{ _id: '2' }])
  })
})
