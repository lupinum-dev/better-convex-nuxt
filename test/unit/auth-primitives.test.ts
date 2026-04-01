import { ConvexError } from 'convex/values'
import { describe, expect, it } from 'vitest'

import { authorize, can, deny, and, or, requireAuth, requireRecord } from '../../src/runtime/auth'
import { verifyTrustedCallerKey } from '../../src/runtime/trusted-caller'
import { applyVisibility, defineVisibility, getVisibilityQuery } from '../../src/runtime/visibility'

type ConvexErrorData = {
  category?: string
  source?: string
  code?: string
  message?: string
}

function expectConvexErrorData(error: unknown): ConvexErrorData {
  expect(error).toBeInstanceOf(ConvexError)
  return (error as ConvexError<ConvexErrorData>).data
}

describe('auth primitives', () => {
  it('evaluates boolean composition helpers', () => {
    const actor = { role: 'member', userId: 'alice' }
    const hasRole =
      (...roles: string[]) =>
      (value: typeof actor | null) =>
        !!value && roles.includes(value.role)
    const owns = (resource: { ownerId: string }) => (value: typeof actor | null) =>
      !!value && value.userId === resource.ownerId

    expect(can(actor, and(hasRole('member'), owns({ ownerId: 'alice' })))).toBe(true)
    expect(can(actor, or(hasRole('admin'), owns({ ownerId: 'alice' })))).toBe(true)
    expect(can(actor, or(hasRole('admin'), false))).toBe(false)
  })

  it('throws forbidden errors from authorize() and narrows the type', () => {
    expect(() => authorize(null, 'Read dashboard', false)).toThrow(/Forbidden: Read dashboard/)

    const actor: { role: string } | null = { role: 'admin' }
    authorize(actor, 'Read dashboard', (a) => a.role === 'admin')
    // After authorize, actor is narrowed to non-null — this access is type-safe
    expect(actor.role).toBe('admin')
  })

  it('authorize() includes auth category when actor is null', () => {
    try {
      authorize(null, 'Read dashboard', true)
    } catch (error) {
      const data = expectConvexErrorData(error)
      expect(data.category).toBe('auth')
    }
  })

  it('authorize() accepts an optional category', () => {
    try {
      authorize({ role: 'viewer' }, 'Manage users', () => false, 'role')
    } catch (error) {
      expect(expectConvexErrorData(error).category).toBe('role')
    }
  })

  it('throws forbidden errors from deny()', () => {
    expect(() => deny('No dashboard for you.')).toThrow(/No dashboard for you/)
  })

  it('deny() accepts a source string (backward compat)', () => {
    try {
      deny('Nope', 'test-source')
    } catch (error) {
      const data = expectConvexErrorData(error)
      expect(data.source).toBe('test-source')
      expect(data.category).toBeUndefined()
    }
  })

  it('deny() accepts an options object with category', () => {
    try {
      deny('Plan limit reached', { category: 'plan', source: 'billing' })
    } catch (error) {
      const data = expectConvexErrorData(error)
      expect(data.category).toBe('plan')
      expect(data.source).toBe('billing')
      expect(data.message).toBe('Plan limit reached')
    }
  })

  it('narrows authenticated actors with requireAuth()', () => {
    const actor: { userId: string } | null = { userId: 'alice' }

    expect(() => requireAuth(actor)).not.toThrow()
    requireAuth(actor)
    expect(actor.userId).toBe('alice')
    expect(() => requireAuth(null)).toThrow(/Not authenticated\./)
  })

  it('fails closed in can() for ConvexError but rethrows programming bugs', () => {
    expect(
      can({}, () => {
        deny('forbidden')
      }),
    ).toBe(false)

    expect(() =>
      can({}, () => {
        throw new Error('boom')
      }),
    ).toThrow('boom')
  })

  it('verifies keys in constant-time-compatible shape', () => {
    expect(verifyTrustedCallerKey('abc', 'abc')).toBe(true)
    expect(verifyTrustedCallerKey('abc', 'def')).toBe(false)
    expect(verifyTrustedCallerKey('', 'def')).toBe(false)
  })

  it('requireRecord throws ConvexError with NOT_FOUND code', () => {
    expect(() => requireRecord(null)).toThrow()
    expect(() => requireRecord(undefined)).toThrow()
    expect(() => requireRecord({ id: '1' })).not.toThrow()

    try {
      requireRecord(null, 'Project')
    } catch (error) {
      const data = expectConvexErrorData(error)
      expect(data.code).toBe('NOT_FOUND')
      expect(data.message).toBe('Project not found.')
    }
  })

  it('requireRecord narrows the type', () => {
    const doc: { name: string } | null = { name: 'test' }
    requireRecord(doc)
    // After requireRecord, doc is narrowed — this access is type-safe
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
