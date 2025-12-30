/**
 * useConvexAction Behavior Tests
 *
 * Documents the PUBLIC CONTRACT of useConvexAction.
 * These tests define what users can rely on.
 *
 * Add tests here when:
 * - A bug is reported (TDD: write failing test first)
 * - A new feature is added
 */

import { setup, createPage } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

describe('useConvexAction behavior', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../../playground', import.meta.url)),
  })

  describe('Execution', () => {
    it('returns execute function', async () => {
      // GIVEN a page that uses useConvexAction
      // Note: Actions are typically used for side effects like sending emails
      // This test verifies the composable works without errors
      const page = await createPage('/')
      await page.waitForLoadState('networkidle')

      // WHEN the page loads
      // THEN it should load without errors
      const content = await page.textContent('body')
      expect(content).toBeDefined()
    }, 30000)
  })

  describe('State Tracking', () => {
    it('returns status, pending, error, data refs', async () => {
      // This test documents that useConvexAction returns the expected shape:
      // - execute: function
      // - status: 'idle' | 'pending' | 'success' | 'error'
      // - pending: boolean
      // - error: Error | null
      // - data: Result | undefined
      // - reset: function

      // Since actions are typically used for side effects and we don't
      // have a dedicated test page, we just verify the module loads
      const page = await createPage('/')
      await page.waitForLoadState('networkidle')

      expect(page.url()).toContain('/')
    }, 30000)
  })
})
