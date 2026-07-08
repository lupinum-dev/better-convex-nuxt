/**
 * Test Setup for Convex-Test
 *
 * Provides the module glob for integration tests.
 */

/// <reference types="vite/client" />

// Glob all convex files for convex-test
export const modules = import.meta.glob('./**/*.ts', {
  // Exclude test files from being loaded as modules
  eager: false,
})
