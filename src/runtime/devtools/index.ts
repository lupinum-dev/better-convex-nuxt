/**
 * DevTools setup utilities.
 * Note: Main DevTools setup is handled directly in module.ts.
 * This file provides type exports and utility functions.
 */

export interface DevToolsSetupOptions {
  /** Resolver for file paths */
  resolve: (...paths: string[]) => string
}
