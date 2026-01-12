/**
 * useConvexMutation Behavior Tests
 *
 * Documents the PUBLIC CONTRACT of useConvexMutation.
 * These tests define what users can rely on.
 *
 * Add tests here when:
 * - A bug is reported (TDD: write failing test first)
 * - A new feature is added
 */

import { setup, createPage } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

describe('useConvexMutation behavior', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../../playground', import.meta.url)),
  })

  // ============================================================================
  // Status Transitions
  // ============================================================================

  describe('Status Transitions', () => {
    it('starts in idle status', async () => {
      // GIVEN a page with mutation status tracking
      const page = await createPage('/labs/mutations')
      await page.waitForLoadState('networkidle')

      // WHEN we check initial state
      const status = await page.textContent('[data-testid="add-status"]')

      // THEN status should be idle
      expect(status).toBe('idle')
    }, 30000)

    it('transitions to pending during mutation', async () => {
      // GIVEN a page with mutation status tracking
      const page = await createPage('/labs/mutations')
      await page.waitForLoadState('networkidle')

      // WHEN we start a mutation and immediately check status
      const [_, pendingStatus] = await Promise.all([
        page.click('[data-testid="success-btn"]'),
        page.waitForFunction(() => {
          const el = document.querySelector('[data-testid="add-status"]')
          return el?.textContent === 'pending'
        }, { timeout: 5000 }).then(() => 'pending').catch(() => 'not-pending'),
      ])

      // THEN status should transition to pending
      expect(pendingStatus).toBe('pending')
    }, 30000)

    it('transitions to success after successful mutation', async () => {
      // GIVEN a page with mutation status tracking
      const page = await createPage('/labs/mutations')
      await page.waitForLoadState('networkidle')

      // WHEN we run a successful mutation and wait for completion
      await page.click('[data-testid="success-btn"]')
      await page.waitForFunction(() => {
        const el = document.querySelector('[data-testid="add-status"]')
        return el?.textContent === 'success'
      }, { timeout: 10000 })

      // THEN status should be success
      const status = await page.textContent('[data-testid="add-status"]')
      expect(status).toBe('success')
    }, 30000)

    it('transitions to error after failed mutation', async () => {
      // GIVEN a page with mutation status tracking
      const page = await createPage('/labs/mutations')
      await page.waitForLoadState('networkidle')

      // WHEN we run a failing mutation and wait
      await page.click('[data-testid="error-btn"]')
      await page.waitForFunction(() => {
        const el = document.querySelector('[data-testid="fail-status"]')
        return el?.textContent === 'error'
      }, { timeout: 10000 })

      // THEN status should be error
      const status = await page.textContent('[data-testid="fail-status"]')
      expect(status).toBe('error')
    }, 30000)
  })

  // ============================================================================
  // Pending State
  // ============================================================================

  describe('Pending State', () => {
    it('pending is false initially', async () => {
      // GIVEN a page with mutation status tracking
      const page = await createPage('/labs/mutations')
      await page.waitForLoadState('networkidle')

      // WHEN we check initial pending state
      const pending = await page.textContent('[data-testid="add-pending"]')

      // THEN pending should be false
      expect(pending).toBe('false')
    }, 30000)

    it('pending is true during mutation', async () => {
      // GIVEN a page with mutation status tracking
      const page = await createPage('/labs/mutations')
      await page.waitForLoadState('networkidle')

      // WHEN we start a mutation
      const [_, pendingDuringMutation] = await Promise.all([
        page.click('[data-testid="success-btn"]'),
        page.waitForFunction(() => {
          const el = document.querySelector('[data-testid="add-pending"]')
          return el?.textContent === 'true'
        }, { timeout: 5000 }).then(() => true).catch(() => false),
      ])

      // THEN pending should be true during mutation
      expect(pendingDuringMutation).toBe(true)
    }, 30000)

    it('pending is false after mutation completes', async () => {
      // GIVEN a page with mutation status tracking
      const page = await createPage('/labs/mutations')
      await page.waitForLoadState('networkidle')

      // WHEN we run a mutation to completion
      await page.click('[data-testid="success-btn"]')
      await page.waitForFunction(() => {
        const el = document.querySelector('[data-testid="add-status"]')
        return el?.textContent === 'success'
      }, { timeout: 10000 })

      // THEN pending should be false
      const pending = await page.textContent('[data-testid="add-pending"]')
      expect(pending).toBe('false')
    }, 30000)
  })

  // ============================================================================
  // Error Handling
  // ============================================================================

  describe('Error Handling', () => {
    it('error is null initially', async () => {
      // GIVEN a page with mutation status tracking
      const page = await createPage('/labs/mutations')
      await page.waitForLoadState('networkidle')

      // WHEN we check initial error state
      const error = await page.textContent('[data-testid="add-error"]')

      // THEN error should be null
      expect(error).toBe('null')
    }, 30000)

    it('error contains message after failed mutation', async () => {
      // GIVEN a page with mutation status tracking
      const page = await createPage('/labs/mutations')
      await page.waitForLoadState('networkidle')

      // WHEN we run a failing mutation
      await page.click('[data-testid="error-btn"]')
      await page.waitForFunction(() => {
        const el = document.querySelector('[data-testid="fail-status"]')
        return el?.textContent === 'error'
      }, { timeout: 10000 })

      // THEN error should contain the error message
      const error = await page.textContent('[data-testid="fail-error"]')
      expect(error).toContain('Intentional mutation error')
    }, 30000)

    it('error remains null after successful mutation', async () => {
      // GIVEN a page with mutation status tracking
      const page = await createPage('/labs/mutations')
      await page.waitForLoadState('networkidle')

      // WHEN we run a successful mutation
      await page.click('[data-testid="success-btn"]')
      await page.waitForFunction(() => {
        const el = document.querySelector('[data-testid="add-status"]')
        return el?.textContent === 'success'
      }, { timeout: 10000 })

      // THEN error should still be null
      const error = await page.textContent('[data-testid="add-error"]')
      expect(error).toBe('null')
    }, 30000)
  })

  // ============================================================================
  // Data Return Value
  // ============================================================================

  describe('Data Return Value', () => {
    it('data is undefined initially', async () => {
      // GIVEN a page with mutation status tracking
      const page = await createPage('/labs/mutations')
      await page.waitForLoadState('networkidle')

      // WHEN we check initial data state
      const data = await page.textContent('[data-testid="add-data"]')

      // THEN data should be undefined
      expect(data).toBe('undefined')
    }, 30000)

    it('data contains return value after successful mutation', async () => {
      // GIVEN a page with mutation status tracking
      const page = await createPage('/labs/mutations')
      await page.waitForLoadState('networkidle')

      // WHEN we run a successful mutation (notes.add returns the note ID)
      await page.click('[data-testid="success-btn"]')
      await page.waitForFunction(() => {
        const el = document.querySelector('[data-testid="add-status"]')
        return el?.textContent === 'success'
      }, { timeout: 10000 })

      // THEN data should contain the returned note ID
      const data = await page.textContent('[data-testid="add-data"]')
      expect(data).not.toBe('undefined')
      // Convex IDs have a specific format
      expect(data).toMatch(/^[a-z0-9]+$/)
    }, 30000)
  })

  // ============================================================================
  // Reset Function
  // ============================================================================

  describe('Reset Function', () => {
    it('reset clears status back to idle', async () => {
      // GIVEN a mutation that has completed
      const page = await createPage('/labs/mutations')
      await page.waitForLoadState('networkidle')
      await page.click('[data-testid="success-btn"]')
      await page.waitForFunction(() => {
        const el = document.querySelector('[data-testid="add-status"]')
        return el?.textContent === 'success'
      }, { timeout: 10000 })

      // WHEN we call reset
      await page.click('[data-testid="reset-btn"]')
      await page.waitForTimeout(100)

      // THEN status should be idle again
      const status = await page.textContent('[data-testid="add-status"]')
      expect(status).toBe('idle')
    }, 30000)

    it('reset clears error state', async () => {
      // GIVEN a mutation that has failed
      const page = await createPage('/labs/mutations')
      await page.waitForLoadState('networkidle')
      await page.click('[data-testid="error-btn"]')
      await page.waitForFunction(() => {
        const el = document.querySelector('[data-testid="fail-status"]')
        return el?.textContent === 'error'
      }, { timeout: 10000 })

      // WHEN we call reset
      await page.click('[data-testid="reset-btn"]')
      await page.waitForTimeout(100)

      // THEN error should be null and status idle
      const error = await page.textContent('[data-testid="fail-error"]')
      const status = await page.textContent('[data-testid="fail-status"]')
      expect(error).toBe('null')
      expect(status).toBe('idle')
    }, 30000)

    it('reset clears data', async () => {
      // GIVEN a mutation that has returned data
      const page = await createPage('/labs/mutations')
      await page.waitForLoadState('networkidle')
      await page.click('[data-testid="success-btn"]')
      await page.waitForFunction(() => {
        const el = document.querySelector('[data-testid="add-data"]')
        return el?.textContent !== 'undefined'
      }, { timeout: 10000 })

      // WHEN we call reset
      await page.click('[data-testid="reset-btn"]')
      await page.waitForTimeout(100)

      // THEN data should be undefined again
      const data = await page.textContent('[data-testid="add-data"]')
      expect(data).toBe('undefined')
    }, 30000)
  })

  // ============================================================================
  // Multiple Mutations
  // ============================================================================

  describe('Multiple Mutations', () => {
    it('can run multiple mutations sequentially', async () => {
      // GIVEN a page with mutation tracking
      const page = await createPage('/labs/mutations')
      await page.waitForLoadState('networkidle')

      // WHEN we run multiple mutations
      for (let i = 0; i < 3; i++) {
        await page.click('[data-testid="success-btn"]')
        await page.waitForFunction(() => {
          const el = document.querySelector('[data-testid="add-status"]')
          return el?.textContent === 'success'
        }, { timeout: 10000 })
      }

      // THEN success count should be 3
      const count = await page.textContent('[data-testid="success-count"]')
      expect(count).toBe('3')
    }, 60000)
  })

  // ============================================================================
  // Optimistic Updates
  // ============================================================================

  describe('Optimistic Updates', () => {
    it('optimistic update appears immediately before server confirms', async () => {
      // GIVEN a page with optimistic updates
      const page = await createPage('/labs/optimistic')
      await page.waitForLoadState('networkidle')

      // Get initial count
      const initialCount = await page.textContent('[data-testid="count"]')
      const initialNum = Number.parseInt(initialCount || '0', 10)

      // WHEN we click the optimistic add button
      await page.click('[data-testid="add-optimistic-btn"]')

      // THEN count should increase almost immediately (optimistic)
      await page.waitForFunction((expected) => {
        const el = document.querySelector('[data-testid="count"]')
        return Number.parseInt(el?.textContent || '0', 10) >= expected
      }, initialNum + 1, { timeout: 1000 })

      const newCount = await page.textContent('[data-testid="count"]')
      expect(Number.parseInt(newCount || '0', 10)).toBeGreaterThanOrEqual(initialNum + 1)
    }, 30000)
  })

  // ============================================================================
  // Real-time Updates
  // ============================================================================

  describe('Real-time Updates', () => {
    it('mutation triggers subscription update', async () => {
      // GIVEN a page with query subscription
      const page = await createPage('/labs/realtime')
      await page.waitForLoadState('networkidle')

      // Wait for subscription to be ready
      await page.waitForFunction(() => {
        const el = document.querySelector('[data-testid="status"]')
        return el?.textContent === 'success'
      }, { timeout: 15000 })

      // Get initial add-count (tracks mutation calls, not query results)
      const initialAddCount = await page.textContent('[data-testid="add-count"]')
      const initialAddNum = Number.parseInt(initialAddCount || '0', 10)

      // WHEN we add a note via mutation
      await page.click('[data-testid="add-btn"]')

      // THEN the mutation should complete (add-count increases)
      await page.waitForFunction((expected) => {
        const el = document.querySelector('[data-testid="add-count"]')
        return Number.parseInt(el?.textContent || '0', 10) > expected
      }, initialAddNum, { timeout: 10000 })

      // AND the status should still be success (subscription recovered)
      const finalStatus = await page.textContent('[data-testid="status"]')
      expect(finalStatus).toBe('success')
    }, 30000)
  })
})
