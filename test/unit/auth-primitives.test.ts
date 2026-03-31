import { describe, expect, it } from 'vitest'

import { ConvexError } from 'convex/values'

import {
  all,
  any,
  applyVisibility,
  can,
  defineVisibility,
  deny,
  ensureFound,
  getVisibilityQuery,
  guard,
  not,
  requirePrincipal,
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

  it('throws forbidden errors from guard() and narrows the type', () => {
    expect(() => guard(null, 'Read dashboard', false)).toThrow(/Forbidden: Read dashboard/)

    const actor: { role: string } | null = { role: 'admin' }
    guard(actor, 'Read dashboard', a => a.role === 'admin')
    // After guard, actor is narrowed to non-null — this access is type-safe
    expect(actor.role).toBe('admin')
  })

  it('guard() includes auth category when principal is null', () => {
    try {
      guard(null, 'Read dashboard', true)
    }
    catch (error) {
      expect(error).toBeInstanceOf(ConvexError)
      expect((error as ConvexError<any>).data.category).toBe('auth')
    }
  })

  it('guard() accepts an optional category', () => {
    try {
      guard({ role: 'viewer' }, 'Manage users', () => false, 'role')
    }
    catch (error) {
      expect(error).toBeInstanceOf(ConvexError)
      expect((error as ConvexError<any>).data.category).toBe('role')
    }
  })

  it('throws forbidden errors from deny()', () => {
    expect(() => deny('No dashboard for you.')).toThrow(/No dashboard for you/)
  })

  it('deny() accepts a source string (backward compat)', () => {
    try {
      deny('Nope', 'test-source')
    }
    catch (error) {
      expect(error).toBeInstanceOf(ConvexError)
      const data = (error as ConvexError<any>).data
      expect(data.source).toBe('test-source')
      expect(data.category).toBeUndefined()
    }
  })

  it('deny() accepts an options object with category', () => {
    try {
      deny('Plan limit reached', { category: 'plan', source: 'billing' })
    }
    catch (error) {
      expect(error).toBeInstanceOf(ConvexError)
      const data = (error as ConvexError<any>).data
      expect(data.category).toBe('plan')
      expect(data.source).toBe('billing')
      expect(data.message).toBe('Plan limit reached')
    }
  })

  it('narrows authenticated principals with requirePrincipal()', () => {
    const actor: { userId: string } | null = { userId: 'alice' }

    expect(() => requirePrincipal(actor)).not.toThrow()
    requirePrincipal(actor)
    expect(actor.userId).toBe('alice')
    expect(() => requirePrincipal(null)).toThrow(/Not authenticated\./)
  })

  it('fails closed in can() for ConvexError but rethrows programming bugs', () => {
    expect(can({}, () => {
      deny('forbidden')
    })).toBe(false)

    expect(() => can({}, () => {
      throw new Error('boom')
    })).toThrow('boom')
  })

  it('verifies keys in constant-time-compatible shape', () => {
    expect(verifyKey('abc', 'abc')).toBe(true)
    expect(verifyKey('abc', 'def')).toBe(false)
    expect(verifyKey('', 'def')).toBe(false)
  })

  it('ensureFound throws ConvexError with NOT_FOUND code', () => {
    expect(() => ensureFound(null)).toThrow()
    expect(() => ensureFound(undefined)).toThrow()
    expect(() => ensureFound({ id: '1' })).not.toThrow()

    try {
      ensureFound(null, 'Project')
    }
    catch (error) {
      expect(error).toBeInstanceOf(ConvexError)
      const data = (error as ConvexError<any>).data
      expect(data.code).toBe('NOT_FOUND')
      expect(data.message).toBe('Project not found.')
    }
  })

  it('ensureFound narrows the type', () => {
    const doc: { name: string } | null = { name: 'test' }
    ensureFound(doc)
    // After ensureFound, doc is narrowed — this access is type-safe
    expect(doc.name).toBe('test')
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

  it('getVisibilityQuery returns the raw query without collecting', async () => {
    const mockQuery = { collect: async () => [{ _id: '1' }] }
    const visibility = defineVisibility(async () => mockQuery)

    const result = await getVisibilityQuery(visibility, { userId: 'a' }, {} as never)
    // Should return the query object itself, not the collected results
    expect(result).toBe(mockQuery)
    expect(Array.isArray(result)).toBe(false)
  })

  it('getVisibilityQuery returns array when resolver returns array', async () => {
    const items = [{ _id: '1' }, { _id: '2' }]
    const visibility = defineVisibility(async () => items)

    const result = await getVisibilityQuery(visibility, { userId: 'a' }, {} as never)
    expect(result).toEqual(items)
    expect(Array.isArray(result)).toBe(true)
  })

  it('getVisibilityQuery returns null for unauthenticated principal', async () => {
    const visibility = defineVisibility(async () => [])
    const result = await getVisibilityQuery(visibility, null, {} as never)
    expect(result).toBeNull()
  })
})
