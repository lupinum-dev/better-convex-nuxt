import { ConvexError } from 'convex/values'
import { describe, expect, it } from 'vitest'

import {
  authRequired,
  enforce,
  can,
  deny,
  and,
  defineGuard,
  isGuard,
  open,
  or,
  requireAuth,
  requireRecord,
  ensureTenant,
  loadTenantResource,
} from '../../src/runtime/auth'
import { isAnonymousPrincipal } from '../../src/runtime/auth/principal-state'
import { verifyTrustedForwardingKey } from '../../src/runtime/trusted-forwarding'

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

  it('creates labeled guards that compose structurally', () => {
    const actor = { role: 'member', userId: 'alice' }

    const isMember = defineGuard<typeof actor | null>(
      'role:member',
      (value) => value?.role === 'member',
    )
    const ownsResource = defineGuard<typeof actor | null>(
      'owner',
      (value) => value?.userId === 'alice',
    )
    const canEdit = isMember.and(ownsResource)
    const cannotEdit = canEdit.not()

    expect(isGuard(isMember)).toBe(true)
    expect(isMember.label).toBe('role:member')
    expect(canEdit.kind).toBe('and')
    expect(canEdit.label).toBe('role:member && owner')
    expect(can(actor, canEdit)).toBe(true)
    expect(can(null, canEdit)).toBe(false)
    expect(can(actor, cannotEdit)).toBe(false)
  })

  it('exports an explicit open guard for public flows', () => {
    expect(open.label).toBe('open')
    expect(can(null, open)).toBe(true)
  })

  it('treats authRequired as a non-composable sentinel guard', () => {
    expect(() => authRequired.and(() => true)).toThrow(/cannot be composed with and/)
    expect(() => authRequired.or(() => true)).toThrow(/cannot be composed with or/)
    expect(() => authRequired.not()).toThrow(/cannot be negated/)
  })

  it('throws forbidden errors from enforce() and narrows the type', () => {
    expect(() => enforce(null, 'Read dashboard', false)).toThrow(/Forbidden: Read dashboard/)

    const actor: { role: string } | null = { role: 'admin' }
    enforce(actor, 'Read dashboard', (a) => a.role === 'admin')
    // After enforce, actor is narrowed to non-null — this access is type-safe
    expect(actor.role).toBe('admin')
  })

  it('enforce() includes auth category when actor is null', () => {
    try {
      enforce(null, 'Read dashboard', true)
    } catch (error) {
      const data = expectConvexErrorData(error)
      expect(data.category).toBe('auth')
    }
  })

  it('enforce() accepts an optional category', () => {
    try {
      enforce({ role: 'viewer' }, 'Manage users', () => false, 'role')
    } catch (error) {
      expect(expectConvexErrorData(error).category).toBe('role')
    }
  })

  it('throws forbidden errors from deny()', () => {
    expect(() => deny('No dashboard for you.')).toThrow(/No dashboard for you/)
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

  it('narrows actors with requireAuth()', () => {
    const actor: { userId: string } | null = { userId: 'alice' }

    expect(() => requireAuth(actor)).not.toThrow()
    requireAuth(actor)
    expect(actor.userId).toBe('alice')
    expect(() => requireAuth(null)).toThrow(/Not authenticated\./)
    expect(() => requireAuth({ kind: 'anonymous' as const })).toThrow(/Not authenticated\./)
  })

  it('identifies anonymous principal states directly', () => {
    expect(isAnonymousPrincipal(undefined)).toBe(true)
    expect(isAnonymousPrincipal(null)).toBe(true)
    expect(isAnonymousPrincipal({ kind: 'anonymous' })).toBe(true)
    expect(isAnonymousPrincipal({ kind: 'user', userId: 'alice' })).toBe(false)
    expect(isAnonymousPrincipal({ userId: 'alice' })).toBe(false)
    expect(isAnonymousPrincipal('user')).toBe(false)
    expect(isAnonymousPrincipal(123)).toBe(false)
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
    expect(verifyTrustedForwardingKey('abc', 'abc')).toBe(true)
    expect(verifyTrustedForwardingKey('abc', 'def')).toBe(false)
    expect(verifyTrustedForwardingKey('', 'def')).toBe(false)
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

  it('ensureTenant rejects cross-tenant resources and returns matching resources', () => {
    const actor = { tenantId: 'workspace-1' }
    const resource = { workspaceId: 'workspace-1', title: 'Project' }

    expect(ensureTenant(actor, resource)).toBe(resource)
    expect(() => ensureTenant(actor, { workspaceId: 'workspace-2' }, 'Project')).toThrow(
      /Project not found/,
    )
  })

  it('loadTenantResource requires the record before checking tenant', () => {
    const actor = { tenantId: 'org-1' }

    expect(() => loadTenantResource(actor, null, 'Organization', 'organizationId')).toThrow(
      /Organization not found/,
    )
    expect(
      loadTenantResource(
        actor,
        { organizationId: 'org-1', name: 'Acme' },
        'Organization',
        'organizationId',
      ),
    ).toEqual({
      organizationId: 'org-1',
      name: 'Acme',
    })
  })
})
