/**
 * Test Setup for Convex-Test
 *
 * Provides fixtures and module glob for integration tests.
 */

/// <reference types="vite/client" />

// Glob all convex files for convex-test
export const modules = import.meta.glob('./**/*.ts', {
  // Exclude test files from being loaded as modules
  eager: false,
})

// Test fixtures for common scenarios
export const fixtures = {
  // Permission contexts for unit tests
  contexts: {
    owner: { role: 'owner' as const, userId: 'user_owner' },
    admin: { role: 'admin' as const, userId: 'user_admin' },
    member: { role: 'member' as const, userId: 'user_member' },
    viewer: { role: 'viewer' as const, userId: 'user_viewer' },
  },

  // User data for integration tests
  users: {
    owner: {
      authId: 'user_owner',
      role: 'owner' as const,
      displayName: 'Owner User',
      email: 'owner@test.com',
    },
    admin: {
      authId: 'user_admin',
      role: 'admin' as const,
      displayName: 'Admin User',
      email: 'admin@test.com',
    },
    member: {
      authId: 'user_member',
      role: 'member' as const,
      displayName: 'Member User',
      email: 'member@test.com',
    },
    viewer: {
      authId: 'user_viewer',
      role: 'viewer' as const,
      displayName: 'Viewer User',
      email: 'viewer@test.com',
    },
  },
}
