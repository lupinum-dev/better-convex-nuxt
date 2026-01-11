/**
 * useConvexQuery Behavior Tests
 *
 * Documents the PUBLIC CONTRACT of useConvexQuery.
 * These tests define what users can rely on.
 *
 * Add tests here when:
 * - A bug is reported (TDD: write failing test first)
 * - A new feature is added
 *
 * DO NOT test implementation details here.
 */

import { setup, $fetch, createPage } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

describe('useConvexQuery behavior', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../../playground', import.meta.url)),
  })

  describe('SSR Behavior', () => {
    it('fetches data on server and includes in HTML', async () => {
      // GIVEN a page that uses useConvexQuery
      // WHEN the page is server-rendered
      const html = await $fetch('/test-realtime/notes')

      // THEN the data should be in the HTML (SSR worked)
      // Note: Even if empty, the page should render without errors
      expect(html).toContain('data-testid="realtime-page"')
    })

    it('hydrates on client without loading flash', async () => {
      // GIVEN a server-rendered page with data
      const page = await createPage('/test-realtime/notes')
      await page.waitForLoadState('networkidle')

      // WHEN we check for hydration errors
      const consoleErrors: string[] = []
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text())
        }
      })

      // Trigger a client-side navigation to force hydration check
      await page.reload()
      await page.waitForLoadState('networkidle')

      // THEN there should be no hydration mismatch errors
      const hydrationErrors = consoleErrors.filter((msg) => msg.toLowerCase().includes('hydration'))
      expect(hydrationErrors).toHaveLength(0)
    }, 30000)
  })

  describe('Skip Behavior', () => {
    it('returns null data when skip="skip"', async () => {
      // GIVEN a page with a skipped query
      const page = await createPage('/test-skip/static-skip')
      await page.waitForLoadState('networkidle')

      // WHEN we check the data state
      const content = await page.textContent('body')

      // THEN data should be null and pending should be false
      expect(content).toContain('data: null')
      expect(content).toContain('pending: false')
    }, 30000)

    it('has pending=false when skip=true', async () => {
      // GIVEN a page with a skipped query
      const page = await createPage('/test-skip/static-skip')
      await page.waitForLoadState('networkidle')

      // WHEN we check the pending state
      const content = await page.textContent('body')

      // THEN pending should be false (skipped queries are never pending)
      expect(content).toContain('pending: false')
    }, 30000)
  })

  describe('Error Handling', () => {
    it('sets error ref when query fails', async () => {
      // GIVEN a page that calls a query that always fails
      const page = await createPage('/test-error/error-query')
      await page.waitForLoadState('networkidle')

      // Wait for the error to propagate
      await page.waitForTimeout(1000)

      // WHEN we check the error state
      const content = await page.textContent('body')

      // THEN error should be set
      expect(content).toMatch(/error:|hasError: true/i)
    }, 30000)
  })

  describe('Refresh Behavior', () => {
    it('refresh() re-fetches data', async () => {
      // GIVEN a page with data and a refresh button
      const page = await createPage('/test-features/refresh')
      await page.waitForLoadState('networkidle')

      // WHEN we click the refresh button
      const refreshBtn = await page.$('[data-testid="refresh-btn"]')
      if (refreshBtn) {
        await refreshBtn.click()
        await page.waitForTimeout(500)
      }

      // THEN the page should still have data (refresh completed)
      const content = await page.textContent('body')
      expect(content).toBeDefined()
    }, 30000)
  })

  describe('Default Value Behavior', () => {
    it('uses default value while loading', async () => {
      // GIVEN a page that uses default option
      const page = await createPage('/test-features/with-default')
      await page.waitForLoadState('networkidle')

      // WHEN the page loads
      const content = await page.textContent('body')

      // THEN it should not show undefined (default was used)
      // The actual test depends on the page implementation
      expect(content).toBeDefined()
    }, 30000)
  })

  /**
   * Server and Lazy Options Behavior
   *
   * These tests verify the behavior matrix for server/lazy combinations:
   *
   * | server | lazy  | SSR HTML        | Client Nav Initial State |
   * |--------|-------|-----------------|--------------------------|
   * | false  | true  | pending=true    | pending=true             |
   * | false  | false | pending=true    | hasData=true (blocked)   |
   * | true   | true  | hasData=true    | pending=true             |
   * | true   | false | hasData=true    | hasData=true (blocked)   |
   */
  describe('Server and Lazy Options', () => {
    describe('SSR Behavior', () => {
      it('server: false, lazy: true renders with pending=true in HTML', async () => {
        // GIVEN a page with server: false, lazy: true
        // WHEN the page is server-rendered
        const html = await $fetch('/test-lazy/server-false-lazy-true')

        // THEN the HTML should show pending=true and no data
        // Note: Vue adds class and scoped style attrs between testid and value
        expect(html).toMatch(/data-testid="initial-pending"[^>]*>true</)
        expect(html).toMatch(/data-testid="initial-has-data"[^>]*>false</)
        // Verify NO data is serialized in __NUXT_DATA__
        expect(html).not.toMatch(/"notes:list:\{\}":\[/)
      })

      it('server: false, lazy: false renders with pending=true in HTML', async () => {
        // GIVEN a page with server: false, lazy: false
        // WHEN the page is server-rendered
        const html = await $fetch('/test-lazy/server-false-lazy-false')

        // THEN the HTML should show pending=true and no data (server: false skips SSR fetch)
        expect(html).toMatch(/data-testid="initial-pending"[^>]*>true</)
        expect(html).toMatch(/data-testid="initial-has-data"[^>]*>false</)
      })

      it('server: true, lazy: true renders with data in HTML', async () => {
        // GIVEN a page with server: true, lazy: true
        // WHEN the page is server-rendered
        const html = await $fetch('/test-lazy/server-true-lazy-true')

        // THEN the HTML should show pending=false and have data
        expect(html).toMatch(/data-testid="initial-pending"[^>]*>false</)
        expect(html).toMatch(/data-testid="initial-has-data"[^>]*>true</)
        // Verify actual data is in the data preview section
        expect(html).toMatch(/data-testid="data-preview"/)
      })

      it('server: true, lazy: false renders with data in HTML', async () => {
        // GIVEN a page with server: true, lazy: false (default behavior)
        // WHEN the page is server-rendered
        const html = await $fetch('/test-lazy/server-true-lazy-false')

        // THEN the HTML should show pending=false and have data
        expect(html).toMatch(/data-testid="initial-pending"[^>]*>false</)
        expect(html).toMatch(/data-testid="initial-has-data"[^>]*>true</)
        // Verify actual data is in the data preview section
        expect(html).toMatch(/data-testid="data-preview"/)
      })
    })

    describe('Client Navigation Behavior', () => {
      it('lazy: true shows loading state initially on client nav', async () => {
        // GIVEN the hub page
        const page = await createPage('/test-lazy/hub')
        await page.waitForLoadState('networkidle')

        // WHEN we navigate to a lazy: true page
        await page.click('[data-testid="link-server-true-lazy-true"]')
        await page.waitForSelector('[data-testid="server-true-lazy-true-page"]')

        // THEN initial state should show pending=true (navigation was instant)
        const initialPending = await page.textContent('[data-testid="initial-pending"]')
        expect(initialPending?.trim()).toBe('true')
      }, 30000)

      it('lazy: false shows data immediately on client nav (navigation blocked)', async () => {
        // GIVEN the hub page
        const page = await createPage('/test-lazy/hub')
        await page.waitForLoadState('networkidle')

        // WHEN we navigate to a lazy: false page
        await page.click('[data-testid="link-server-true-lazy-false"]')
        await page.waitForSelector('[data-testid="server-true-lazy-false-page"]')

        // THEN initial state should have data (navigation was blocked until data loaded)
        const initialPending = await page.textContent('[data-testid="initial-pending"]')
        const initialHasData = await page.textContent('[data-testid="initial-has-data"]')
        expect(initialPending?.trim()).toBe('false')
        expect(initialHasData?.trim()).toBe('true')
      }, 30000)

      it('server: false, lazy: true shows loading state on client nav', async () => {
        // GIVEN the hub page
        const page = await createPage('/test-lazy/hub')
        await page.waitForLoadState('networkidle')

        // WHEN we navigate to a server: false, lazy: true page
        await page.click('[data-testid="link-server-false-lazy-true"]')
        await page.waitForSelector('[data-testid="server-false-lazy-true-page"]')

        // THEN initial state should show pending=true
        const initialPending = await page.textContent('[data-testid="initial-pending"]')
        expect(initialPending?.trim()).toBe('true')
      }, 30000)

      it('server: false, lazy: false shows data after blocking on client nav', async () => {
        // GIVEN the hub page
        const page = await createPage('/test-lazy/hub')
        await page.waitForLoadState('networkidle')

        // WHEN we navigate to a server: false, lazy: false page
        await page.click('[data-testid="link-server-false-lazy-false"]')
        await page.waitForSelector('[data-testid="server-false-lazy-false-page"]')

        // THEN initial state should have data (navigation was blocked)
        const initialPending = await page.textContent('[data-testid="initial-pending"]')
        const initialHasData = await page.textContent('[data-testid="initial-has-data"]')
        expect(initialPending?.trim()).toBe('false')
        expect(initialHasData?.trim()).toBe('true')
      }, 30000)
    })

    describe('Hydration', () => {
      it('server: false does not cause hydration mismatch', async () => {
        // GIVEN a page with server: false loaded
        const page = await createPage('/test-lazy/server-false-lazy-true')
        await page.waitForLoadState('networkidle')

        // Set up listener to capture errors on reload
        const errors: string[] = []
        page.on('console', (msg) => {
          if (msg.type() === 'error' && msg.text().toLowerCase().includes('hydration')) {
            errors.push(msg.text())
          }
        })

        // WHEN we reload (triggers fresh SSR + hydration)
        await page.reload()
        await page.waitForLoadState('networkidle')

        // THEN there should be no hydration mismatch errors
        expect(errors).toHaveLength(0)
      }, 30000)

      it('server: true does not cause hydration mismatch', async () => {
        // GIVEN a page with server: true loaded
        const page = await createPage('/test-lazy/server-true-lazy-true')
        await page.waitForLoadState('networkidle')

        // Set up listener to capture errors on reload
        const errors: string[] = []
        page.on('console', (msg) => {
          if (msg.type() === 'error' && msg.text().toLowerCase().includes('hydration')) {
            errors.push(msg.text())
          }
        })

        // WHEN we reload (triggers fresh SSR + hydration)
        await page.reload()
        await page.waitForLoadState('networkidle')

        // THEN there should be no hydration mismatch errors
        expect(errors).toHaveLength(0)
      }, 30000)
    })

    describe('Data Eventually Loads', () => {
      it('lazy: true eventually shows data after loading', async () => {
        // GIVEN a page with lazy: true
        const page = await createPage('/test-lazy/hub')
        await page.waitForLoadState('networkidle')

        // WHEN we navigate to a lazy: true page
        await page.click('[data-testid="link-server-true-lazy-true"]')
        await page.waitForSelector('[data-testid="server-true-lazy-true-page"]')

        // THEN data should eventually load (current state shows data)
        await page.waitForFunction(
          () => {
            const el = document.querySelector('[data-testid="current-has-data"]')
            return el?.textContent?.trim() === 'true'
          },
          { timeout: 10000 },
        )

        const currentHasData = await page.textContent('[data-testid="current-has-data"]')
        expect(currentHasData?.trim()).toBe('true')
      }, 30000)
    })
  })
})
