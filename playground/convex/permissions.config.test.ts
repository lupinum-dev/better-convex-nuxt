/**
 * BDD Tests for checkPermission()
 *
 * Test-first approach: These tests define the expected behavior
 * before the implementation exists.
 */

import { describe, it, expect } from 'vitest'

import { checkPermission, type PermissionContext, type Permission } from './permissions.config'

// Test fixtures
const contexts = {
  owner: { role: 'owner', userId: 'user_owner' } as PermissionContext,
  admin: { role: 'admin', userId: 'user_admin' } as PermissionContext,
  member: { role: 'member', userId: 'user_member' } as PermissionContext,
  viewer: { role: 'viewer', userId: 'user_viewer' } as PermissionContext,
}

const posts = {
  ownedByMember: { ownerId: 'user_member' },
  ownedByAdmin: { ownerId: 'user_admin' },
  ownedByOther: { ownerId: 'user_other' },
}

describe('checkPermission', () => {
  // ==========================================
  // Edge cases
  // ==========================================

  describe('edge cases', () => {
    it('returns false when context is null', () => {
      expect(checkPermission(null, 'post.create')).toBe(false)
    })

    it('returns false for unknown permission', () => {
      expect(checkPermission(contexts.owner, 'unknown.action' as Permission)).toBe(false)
    })

    it('returns false for unknown resource type', () => {
      expect(checkPermission(contexts.owner, 'unicorn.create' as Permission)).toBe(false)
    })
  })

  // ==========================================
  // Global permissions (org-level)
  // ==========================================

  describe('global permissions', () => {
    describe('org.settings', () => {
      it('allows owner', () => {
        expect(checkPermission(contexts.owner, 'org.settings')).toBe(true)
      })

      it('denies admin', () => {
        expect(checkPermission(contexts.admin, 'org.settings')).toBe(false)
      })

      it('denies member', () => {
        expect(checkPermission(contexts.member, 'org.settings')).toBe(false)
      })

      it('denies viewer', () => {
        expect(checkPermission(contexts.viewer, 'org.settings')).toBe(false)
      })
    })

    describe('org.billing', () => {
      it('allows owner', () => {
        expect(checkPermission(contexts.owner, 'org.billing')).toBe(true)
      })

      it('denies admin', () => {
        expect(checkPermission(contexts.admin, 'org.billing')).toBe(false)
      })
    })

    describe('org.invite', () => {
      it('allows owner', () => {
        expect(checkPermission(contexts.owner, 'org.invite')).toBe(true)
      })

      it('allows admin', () => {
        expect(checkPermission(contexts.admin, 'org.invite')).toBe(true)
      })

      it('denies member', () => {
        expect(checkPermission(contexts.member, 'org.invite')).toBe(false)
      })

      it('denies viewer', () => {
        expect(checkPermission(contexts.viewer, 'org.invite')).toBe(false)
      })
    })

    describe('org.members', () => {
      it('allows owner', () => {
        expect(checkPermission(contexts.owner, 'org.members')).toBe(true)
      })

      it('allows admin', () => {
        expect(checkPermission(contexts.admin, 'org.members')).toBe(true)
      })

      it('denies member', () => {
        expect(checkPermission(contexts.member, 'org.members')).toBe(false)
      })

      it('denies viewer', () => {
        expect(checkPermission(contexts.viewer, 'org.members')).toBe(false)
      })
    })
  })

  // ==========================================
  // Simple role-based permissions
  // ==========================================

  describe('simple role permissions', () => {
    describe('post.create', () => {
      it('allows owner', () => {
        expect(checkPermission(contexts.owner, 'post.create')).toBe(true)
      })

      it('allows admin', () => {
        expect(checkPermission(contexts.admin, 'post.create')).toBe(true)
      })

      it('allows member', () => {
        expect(checkPermission(contexts.member, 'post.create')).toBe(true)
      })

      it('denies viewer', () => {
        expect(checkPermission(contexts.viewer, 'post.create')).toBe(false)
      })
    })

    describe('post.read', () => {
      it('allows all roles', () => {
        expect(checkPermission(contexts.owner, 'post.read')).toBe(true)
        expect(checkPermission(contexts.admin, 'post.read')).toBe(true)
        expect(checkPermission(contexts.member, 'post.read')).toBe(true)
        expect(checkPermission(contexts.viewer, 'post.read')).toBe(true)
      })
    })

    describe('post.publish', () => {
      it('allows owner', () => {
        expect(checkPermission(contexts.owner, 'post.publish')).toBe(true)
      })

      it('allows admin', () => {
        expect(checkPermission(contexts.admin, 'post.publish')).toBe(true)
      })

      it('denies member', () => {
        expect(checkPermission(contexts.member, 'post.publish')).toBe(false)
      })

      it('denies viewer', () => {
        expect(checkPermission(contexts.viewer, 'post.publish')).toBe(false)
      })
    })
  })

  // ==========================================
  // Ownership-based permissions (own/any)
  // ==========================================

  describe('ownership-based permissions', () => {
    describe('post.update', () => {
      describe('owner role', () => {
        it('can update any post', () => {
          expect(checkPermission(contexts.owner, 'post.update', posts.ownedByMember)).toBe(true)
          expect(checkPermission(contexts.owner, 'post.update', posts.ownedByAdmin)).toBe(true)
          expect(checkPermission(contexts.owner, 'post.update', posts.ownedByOther)).toBe(true)
        })
      })

      describe('admin role', () => {
        it('can update any post', () => {
          expect(checkPermission(contexts.admin, 'post.update', posts.ownedByMember)).toBe(true)
          expect(checkPermission(contexts.admin, 'post.update', posts.ownedByOther)).toBe(true)
        })
      })

      describe('member role', () => {
        it('can update own post', () => {
          expect(checkPermission(contexts.member, 'post.update', posts.ownedByMember)).toBe(true)
        })

        it('cannot update others post', () => {
          expect(checkPermission(contexts.member, 'post.update', posts.ownedByAdmin)).toBe(false)
          expect(checkPermission(contexts.member, 'post.update', posts.ownedByOther)).toBe(false)
        })
      })

      describe('viewer role', () => {
        it('cannot update any post', () => {
          expect(checkPermission(contexts.viewer, 'post.update', posts.ownedByMember)).toBe(false)
          expect(checkPermission(contexts.viewer, 'post.update', posts.ownedByAdmin)).toBe(false)
        })
      })
    })

    describe('post.delete', () => {
      describe('owner role', () => {
        it('can delete any post', () => {
          expect(checkPermission(contexts.owner, 'post.delete', posts.ownedByMember)).toBe(true)
        })
      })

      describe('admin role', () => {
        it('can delete any post', () => {
          expect(checkPermission(contexts.admin, 'post.delete', posts.ownedByMember)).toBe(true)
        })
      })

      describe('member role', () => {
        it('can delete own post', () => {
          expect(checkPermission(contexts.member, 'post.delete', posts.ownedByMember)).toBe(true)
        })

        it('cannot delete others post', () => {
          expect(checkPermission(contexts.member, 'post.delete', posts.ownedByAdmin)).toBe(false)
        })
      })

      describe('viewer role', () => {
        it('cannot delete any post', () => {
          expect(checkPermission(contexts.viewer, 'post.delete', posts.ownedByMember)).toBe(false)
        })
      })
    })

    describe('without resource', () => {
      it('returns false for member checking own permission without resource', () => {
        // Member needs a resource to check ownership
        expect(checkPermission(contexts.member, 'post.update')).toBe(false)
      })

      it('returns true for admin checking any permission without resource', () => {
        // Admin can update "any", doesn't need specific resource
        expect(checkPermission(contexts.admin, 'post.update')).toBe(true)
      })
    })
  })

  // ==========================================
  // Comment permissions (similar pattern)
  // ==========================================

  describe('comment permissions', () => {
    const comments = {
      ownedByViewer: { ownerId: 'user_viewer' },
      ownedByOther: { ownerId: 'user_other' },
    }

    describe('comment.create', () => {
      it('allows all roles including viewer', () => {
        expect(checkPermission(contexts.owner, 'comment.create')).toBe(true)
        expect(checkPermission(contexts.admin, 'comment.create')).toBe(true)
        expect(checkPermission(contexts.member, 'comment.create')).toBe(true)
        expect(checkPermission(contexts.viewer, 'comment.create')).toBe(true)
      })
    })

    describe('comment.update', () => {
      it('allows viewer to update own comment', () => {
        expect(checkPermission(contexts.viewer, 'comment.update', comments.ownedByViewer)).toBe(
          true,
        )
      })

      it('denies viewer from updating others comment', () => {
        expect(checkPermission(contexts.viewer, 'comment.update', comments.ownedByOther)).toBe(
          false,
        )
      })

      it('allows admin to update any comment', () => {
        expect(checkPermission(contexts.admin, 'comment.update', comments.ownedByOther)).toBe(true)
      })
    })

    describe('comment.delete', () => {
      it('allows viewer to delete own comment', () => {
        expect(checkPermission(contexts.viewer, 'comment.delete', comments.ownedByViewer)).toBe(
          true,
        )
      })

      it('denies viewer from deleting others comment', () => {
        expect(checkPermission(contexts.viewer, 'comment.delete', comments.ownedByOther)).toBe(
          false,
        )
      })

      it('allows owner to delete any comment', () => {
        expect(checkPermission(contexts.owner, 'comment.delete', comments.ownedByOther)).toBe(true)
      })
    })
  })
})
