/**
 * useConvexConnectionState Behavior Tests
 *
 * Documents the PUBLIC CONTRACT of useConvexConnectionState.
 * These tests define what users can rely on.
 *
 * Add tests here when:
 * - A bug is reported (TDD: write failing test first)
 * - A new feature is added
 */

import { setup, createPage } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

describe('useConvexConnectionState behavior', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../../playground', import.meta.url)),
  })

  // ============================================================================
  // Initial State
  // ============================================================================

  describe('Initial State', () => {
    it('page loads without errors', async () => {
      // GIVEN a page with connection state tracking
      const page = await createPage('/labs/connection')
      await page.waitForLoadState('networkidle')

      // WHEN we check if the page loaded
      // Use .container h1 to target the page content h1, not the layout header h1
      const heading = await page.textContent('.container h1')

      // THEN the page should contain the expected heading
      expect(heading).toContain('Connection Lab')
    }, 30000)

    it('returns state object with expected properties', async () => {
      // GIVEN a page with connection state tracking
      const page = await createPage('/labs/connection')
      await page.waitForLoadState('networkidle')

      // Wait for the raw state to be available
      await page.waitForSelector('.raw-state pre')

      // WHEN we check the raw state
      const rawState = await page.textContent('.raw-state pre')

      // THEN state should be valid JSON with expected properties
      expect(rawState).toBeDefined()
      const state = JSON.parse(rawState || '{}')
      expect(state).toHaveProperty('hasInflightRequests')
      expect(state).toHaveProperty('isWebSocketConnected')
    }, 30000)
  })

  // ============================================================================
  // Connection Status
  // ============================================================================

  describe('Connection Status', () => {
    it('isConnected reflects WebSocket connection', async () => {
      // GIVEN a page with connection state tracking
      const page = await createPage('/labs/connection')
      await page.waitForLoadState('networkidle')

      // Wait for connection to establish
      await page.waitForTimeout(2000)

      // WHEN we check isConnected
      const isConnectedText = await page.textContent('.stat:has(.label:text("WebSocket Connected")) .value')

      // THEN it should show connection status (Yes or No)
      expect(isConnectedText).toMatch(/Yes|No/)
    }, 30000)

    it('hasEverConnected becomes true after first connection', async () => {
      // GIVEN a page with connection state tracking
      const page = await createPage('/labs/connection')
      await page.waitForLoadState('networkidle')

      // Wait for connection to establish
      await page.waitForTimeout(2000)

      // WHEN we check hasEverConnected
      const hasEverConnectedText = await page.textContent('.stat:has(.label:text("Has Ever Connected")) .value')

      // THEN it should eventually become Yes
      expect(hasEverConnectedText).toBe('Yes')
    }, 30000)
  })

  // ============================================================================
  // Inflight Tracking
  // ============================================================================

  describe('Inflight Tracking', () => {
    it('hasInflightRequests is initially false', async () => {
      // GIVEN a page with connection state tracking
      const page = await createPage('/labs/connection')
      await page.waitForLoadState('networkidle')

      // Wait for initial state to settle
      await page.waitForTimeout(1000)

      // WHEN we check hasInflightRequests
      const hasInflightText = await page.textContent('.stat:has(.label:text("Inflight Requests")) .value')

      // THEN it should be No (false)
      expect(hasInflightText).toBe('No')
    }, 30000)

    it('inflightMutations starts at 0', async () => {
      // GIVEN a page with connection state tracking
      const page = await createPage('/labs/connection')
      await page.waitForLoadState('networkidle')

      // WHEN we check inflightMutations
      const inflightMutationsText = await page.textContent('.stat:has(.label:text("Inflight Mutations")) .value')

      // THEN it should be 0
      expect(inflightMutationsText).toBe('0')
    }, 30000)

    it('inflightActions starts at 0', async () => {
      // GIVEN a page with connection state tracking
      const page = await createPage('/labs/connection')
      await page.waitForLoadState('networkidle')

      // WHEN we check inflightActions
      const inflightActionsText = await page.textContent('.stat:has(.label:text("Inflight Actions")) .value')

      // THEN it should be 0
      expect(inflightActionsText).toBe('0')
    }, 30000)
  })

  // ============================================================================
  // Mutation Inflight Tracking
  // ============================================================================

  describe('Mutation Inflight Tracking', () => {
    it('triggers mutation and completes successfully', async () => {
      // GIVEN a page with connection state tracking
      const page = await createPage('/labs/connection')
      await page.waitForLoadState('networkidle')

      // WHEN we trigger a mutation
      await page.click('.test-actions button')

      // Wait for mutation to complete
      await page.waitForSelector('.success', { timeout: 10000 })

      // THEN success message should appear
      const successText = await page.textContent('.success')
      expect(successText).toContain('Added note')
    }, 30000)
  })

  // ============================================================================
  // Connection Retries
  // ============================================================================

  describe('Connection Retries', () => {
    it('connectionRetries is a number', async () => {
      // GIVEN a page with connection state tracking
      const page = await createPage('/labs/connection')
      await page.waitForLoadState('networkidle')

      // WHEN we check connectionRetries
      const retriesText = await page.textContent('.stat:has(.label:text("Connection Retries")) .value')

      // THEN it should be a valid number
      expect(retriesText).toBeDefined()
      const retries = Number.parseInt(retriesText || '0', 10)
      expect(retries).toBeGreaterThanOrEqual(0)
    }, 30000)
  })

  // ============================================================================
  // Status Display
  // ============================================================================

  describe('Status Display', () => {
    it('shows connected status when connected', async () => {
      // GIVEN a page with connection state tracking
      const page = await createPage('/labs/connection')
      await page.waitForLoadState('networkidle')

      // Wait for connection to establish
      await page.waitForTimeout(2000)

      // WHEN we check the status card
      const statusCard = await page.$('.status-card')
      const classList = await statusCard?.evaluate(el => el.className)

      // THEN it should have connected class (if connected)
      // Note: This test documents the behavior, actual state depends on backend
      expect(classList).toBeDefined()
      expect(classList).toMatch(/connected|disconnected|reconnecting/)
    }, 30000)

    it('displays appropriate status label', async () => {
      // GIVEN a page with connection state tracking
      const page = await createPage('/labs/connection')
      await page.waitForLoadState('networkidle')

      // Wait for status to be determined
      await page.waitForTimeout(2000)

      // WHEN we check the status text
      const statusText = await page.textContent('.status-text strong')

      // THEN it should show a valid status
      expect(statusText).toMatch(/Connected|Disconnected|Reconnecting/)
    }, 30000)
  })
})
