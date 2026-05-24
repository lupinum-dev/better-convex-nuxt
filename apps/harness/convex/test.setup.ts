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

export const fixtures = {
  users: {
    owner: {
      authKey: 'user_owner',
      role: 'owner' as const,
      displayName: 'Owner User',
      email: 'owner@test.com',
    },
    admin: {
      authKey: 'user_admin',
      role: 'admin' as const,
      displayName: 'Admin User',
      email: 'admin@test.com',
    },
    member: {
      authKey: 'user_member',
      role: 'member' as const,
      displayName: 'Member User',
      email: 'member@test.com',
    },
    viewer: {
      authKey: 'user_viewer',
      role: 'viewer' as const,
      displayName: 'Viewer User',
      email: 'viewer@test.com',
    },
  },
}
