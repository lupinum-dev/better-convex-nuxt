/**
 * BDD Tests for Permission Helpers
 *
 * Unit tests for pure functions (requireSameOrg)
 * Integration tests for authorize() will be separate
 */

import { describe, it, expect } from 'vitest'

import type { Id } from '../_generated/dataModel'

import { requireSameOrg, type AuthUser } from './permissions'

// Test fixtures
const createUser = (overrides: Partial<AuthUser> = {}): AuthUser => ({
  _id: 'user_id' as Id<'users'>,
  authId: 'auth_123',
  role: 'member',
  organizationId: 'org_123' as Id<'organizations'>,
  displayName: 'Test User',
  email: 'test@example.com',
  ...overrides,
})

describe('requireSameOrg', () => {
  describe('when user and resource are in same org', () => {
    it('returns true', () => {
      const user = createUser({ organizationId: 'org_123' as Id<'organizations'> })
      const resource = { organizationId: 'org_123' as Id<'organizations'> }
      expect(requireSameOrg(user, resource)).toBe(true)
    })
  })

  describe('when user and resource are in different orgs', () => {
    it('returns false', () => {
      const user = createUser({ organizationId: 'org_123' as Id<'organizations'> })
      const resource = { organizationId: 'org_456' as Id<'organizations'> }
      expect(requireSameOrg(user, resource)).toBe(false)
    })
  })

  describe('when user is null', () => {
    it('returns false', () => {
      const resource = { organizationId: 'org_123' as Id<'organizations'> }
      expect(requireSameOrg(null, resource)).toBe(false)
    })
  })

  describe('when resource is null', () => {
    it('returns false', () => {
      const user = createUser()
      expect(requireSameOrg(user, null)).toBe(false)
    })
  })

  describe('when both are null', () => {
    it('returns false', () => {
      expect(requireSameOrg(null, null)).toBe(false)
    })
  })

  describe('type narrowing', () => {
    it('narrows resource type when returning true', () => {
      const user = createUser()
      const resource: { organizationId: Id<'organizations'> } | null = {
        organizationId: 'org_123' as Id<'organizations'>,
      }

      if (requireSameOrg(user, resource)) {
        // TypeScript should know resource is not null here
        // This test verifies the type guard works
        expect(resource.organizationId).toBe('org_123')
      }
    })
  })
})
