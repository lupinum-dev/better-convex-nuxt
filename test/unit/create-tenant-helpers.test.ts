import { describe, expect, it, vi } from 'vitest'

import { createTenantHelpers } from '../../src/runtime/tenant/create-tenant-helpers'
import { defineTenant } from '../../src/runtime/tenant/define-tenant'
import { TenantError } from '../../src/runtime/tenant/errors'

// ============================================================================
// Test Fixtures
// ============================================================================

const TEST_USER = {
  _id: 'user_1' as any,
  userId: 'auth_1',
  orgId: 'org_abc' as any,
  role: 'member',
}

function createMockBuilders() {
  // These mock Convex's query() and mutation() builders.
  // They capture the handler and call it with a mock ctx.
  const queryBuilder = vi.fn((def: any) => {
    // Return the handler wrapped so tests can call it
    return { _handler: def.handler, _args: def.args }
  })

  const mutationBuilder = vi.fn((def: any) => {
    return { _handler: def.handler, _args: def.args }
  })

  return { queryBuilder, mutationBuilder }
}

function createMockCtx(overrides: Record<string, any> = {}) {
  const mockQuery = {
    withIndex: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    collect: vi.fn().mockResolvedValue([]),
    first: vi.fn().mockResolvedValue(null),
  }

  return {
    auth: { getUserIdentity: vi.fn().mockResolvedValue(null) },
    db: {
      query: vi.fn().mockReturnValue(mockQuery),
      get: vi.fn().mockResolvedValue(null),
      insert: vi.fn().mockResolvedValue('new_id'),
      patch: vi.fn(),
      replace: vi.fn(),
      delete: vi.fn(),
      _mockQuery: mockQuery,
    },
    ...overrides,
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('createTenantHelpers', () => {
  it('returns scopedQuery and scopedMutation', () => {
    const { queryBuilder, mutationBuilder } = createMockBuilders()
    const config = defineTenant({
      scopedTables: ['posts'] as const,
      resolveUser: async () => TEST_USER,
    })

    const helpers = createTenantHelpers(config, {
      query: queryBuilder,
      mutation: mutationBuilder,
    })

    expect(helpers.scopedQuery).toBeTypeOf('function')
    expect(helpers.scopedMutation).toBeTypeOf('function')
  })

  describe('scopedQuery', () => {
    it('calls the query builder with the args', () => {
      const { queryBuilder, mutationBuilder } = createMockBuilders()
      const config = defineTenant({
        scopedTables: ['posts'] as const,
        resolveUser: async () => TEST_USER,
      })
      const { scopedQuery } = createTenantHelpers(config, {
        query: queryBuilder,
        mutation: mutationBuilder,
      })

      scopedQuery({ args: {}, handler: async () => [] })

      expect(queryBuilder).toHaveBeenCalledTimes(1)
    })

    it('returns empty array when resolveUser returns null', async () => {
      const { queryBuilder, mutationBuilder } = createMockBuilders()
      const config = defineTenant({
        scopedTables: ['posts'] as const,
        resolveUser: async () => null,
      })
      const { scopedQuery } = createTenantHelpers(config, {
        query: queryBuilder,
        mutation: mutationBuilder,
      })

      const registered = scopedQuery({ args: {}, handler: async () => ['should not reach'] })
      const ctx = createMockCtx()
      const result = await registered._handler(ctx, {})

      expect(result).toEqual([])
    })

    it('provides scoped db and tenant context to handler', async () => {
      const { queryBuilder, mutationBuilder } = createMockBuilders()
      const config = defineTenant({
        scopedTables: ['posts'] as const,
        resolveUser: async () => TEST_USER,
      })
      const handler = vi.fn().mockResolvedValue([])
      const { scopedQuery } = createTenantHelpers(config, {
        query: queryBuilder,
        mutation: mutationBuilder,
      })

      const registered = scopedQuery({ args: {}, handler })
      const ctx = createMockCtx()
      await registered._handler(ctx, {})

      expect(handler).toHaveBeenCalledTimes(1)
      const [db, args, tenant] = handler.mock.calls[0]

      // db should have query and get methods
      expect(db.query).toBeTypeOf('function')
      expect(db.get).toBeTypeOf('function')

      // tenant should have user, orgId, can, owns, raw
      expect(tenant.user).toEqual(TEST_USER)
      expect(tenant.orgId).toBe('org_abc')
      expect(tenant.can).toBeTypeOf('function')
      expect(tenant.owns).toBeTypeOf('function')
      expect(tenant.raw.ctx).toBe(ctx)
      expect(tenant.raw.db).toBe(ctx.db)
    })
  })

  describe('scopedMutation', () => {
    it('throws UNAUTHENTICATED when resolveUser returns null', async () => {
      const { queryBuilder, mutationBuilder } = createMockBuilders()
      const config = defineTenant({
        scopedTables: ['posts'] as const,
        resolveUser: async () => null,
      })
      const { scopedMutation } = createTenantHelpers(config, {
        query: queryBuilder,
        mutation: mutationBuilder,
      })

      const registered = scopedMutation({ args: {}, handler: async () => {} })
      const ctx = createMockCtx()

      await expect(registered._handler(ctx, {})).rejects.toThrow(TenantError)
      await expect(registered._handler(ctx, {})).rejects.toThrow('Authentication required')
    })

    it('checks permission when specified', async () => {
      const { queryBuilder, mutationBuilder } = createMockBuilders()
      const checkPermission = vi.fn().mockReturnValue(false)
      const config = defineTenant({
        scopedTables: ['posts'] as const,
        resolveUser: async () => TEST_USER,
      })
      const { scopedMutation } = createTenantHelpers(config, {
        query: queryBuilder,
        mutation: mutationBuilder,
        checkPermission,
      })

      const registered = scopedMutation({
        args: {},
        permission: 'post.create',
        handler: async () => {},
      })
      const ctx = createMockCtx()

      await expect(registered._handler(ctx, {})).rejects.toThrow('Permission denied')
      expect(checkPermission).toHaveBeenCalledWith(
        { role: 'member', userId: 'auth_1' },
        'post.create',
        undefined,
      )
    })

    it('allows when permission check passes', async () => {
      const { queryBuilder, mutationBuilder } = createMockBuilders()
      const checkPermission = vi.fn().mockReturnValue(true)
      const config = defineTenant({
        scopedTables: ['posts'] as const,
        resolveUser: async () => TEST_USER,
      })
      const handler = vi.fn().mockResolvedValue('ok')
      const { scopedMutation } = createTenantHelpers(config, {
        query: queryBuilder,
        mutation: mutationBuilder,
        checkPermission,
      })

      const registered = scopedMutation({
        args: {},
        permission: 'post.create',
        handler,
      })
      const ctx = createMockCtx()
      const result = await registered._handler(ctx, {})

      expect(result).toBe('ok')
      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('fetches resource and passes to permission check', async () => {
      const { queryBuilder, mutationBuilder } = createMockBuilders()
      const checkPermission = vi.fn().mockReturnValue(true)
      const config = defineTenant({
        scopedTables: ['posts'] as const,
        resolveUser: async () => TEST_USER,
      })
      const post = { _id: 'post1', ownerId: 'auth_1', organizationId: 'org_abc' }
      const resource = vi.fn().mockResolvedValue(post)
      const handler = vi.fn().mockResolvedValue('ok')

      const { scopedMutation } = createTenantHelpers(config, {
        query: queryBuilder,
        mutation: mutationBuilder,
        checkPermission,
      })

      const registered = scopedMutation({
        args: {},
        permission: 'post.update',
        resource,
        handler,
      })
      const ctx = createMockCtx()
      await registered._handler(ctx, { id: 'post1' })

      expect(resource).toHaveBeenCalledTimes(1)
      expect(checkPermission).toHaveBeenCalledWith(
        { role: 'member', userId: 'auth_1' },
        'post.update',
        post,
      )
      // Handler should receive the resource via tenant context
      const [, , tenant] = handler.mock.calls[0]
      expect(tenant.resource).toEqual(post)
    })

    it('throws RESOURCE_NOT_FOUND when resource returns null', async () => {
      const { queryBuilder, mutationBuilder } = createMockBuilders()
      const config = defineTenant({
        scopedTables: ['posts'] as const,
        resolveUser: async () => TEST_USER,
      })
      const { scopedMutation } = createTenantHelpers(config, {
        query: queryBuilder,
        mutation: mutationBuilder,
      })

      const registered = scopedMutation({
        args: {},
        resource: async () => null,
        handler: async () => {},
      })
      const ctx = createMockCtx()

      await expect(registered._handler(ctx, {})).rejects.toThrow('Document not found')
    })
  })

  describe('tenant context', () => {
    it('can() returns true when no checkPermission provided', async () => {
      const { queryBuilder, mutationBuilder } = createMockBuilders()
      const config = defineTenant({
        scopedTables: ['posts'] as const,
        resolveUser: async () => TEST_USER,
      })
      const handler = vi.fn().mockResolvedValue('ok')
      const { scopedQuery } = createTenantHelpers(config, {
        query: queryBuilder,
        mutation: mutationBuilder,
      })

      const registered = scopedQuery({ args: {}, handler })
      const ctx = createMockCtx()
      await registered._handler(ctx, {})

      const tenant = handler.mock.calls[0][2]
      expect(tenant.can('anything')).toBe(true)
    })

    it('owns() checks ownerId against userId', async () => {
      const { queryBuilder, mutationBuilder } = createMockBuilders()
      const config = defineTenant({
        scopedTables: ['posts'] as const,
        resolveUser: async () => TEST_USER,
      })
      const handler = vi.fn().mockResolvedValue('ok')
      const { scopedQuery } = createTenantHelpers(config, {
        query: queryBuilder,
        mutation: mutationBuilder,
      })

      const registered = scopedQuery({ args: {}, handler })
      const ctx = createMockCtx()
      await registered._handler(ctx, {})

      const tenant = handler.mock.calls[0][2]
      expect(tenant.owns({ ownerId: 'auth_1' })).toBe(true)
      expect(tenant.owns({ ownerId: 'auth_other' })).toBe(false)
      expect(tenant.owns(null)).toBe(false)
    })
  })
})
