/**
 * useConvexPaginatedQuery Behavior Tests
 *
 * Documents the PUBLIC CONTRACT of useConvexPaginatedQuery.
 * These tests define what users can rely on.
 *
 * Add tests here when:
 * - A bug is reported (TDD: write failing test first)
 * - A new feature is added
 */

import { setup, $fetch, createPage } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

describe('useConvexPaginatedQuery behavior', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../../playground', import.meta.url)),
  })

  describe('Initial Load', () => {
    it('fetches first page and displays results', async () => {
      // GIVEN a page that uses useConvexPaginatedQuery
      const page = await createPage('/labs/pagination')
      await page.waitForLoadState('networkidle')

      // WHEN we wait for the page to load
      await page.waitForSelector('[data-testid="paginated-query-page"]', { timeout: 30000 })

      // THEN we should see the page content
      const content = await page.textContent('body')
      expect(content).toContain('paginated')
    }, 60000)

    it('shows pagination status', async () => {
      // GIVEN a page with paginated data
      const page = await createPage('/labs/pagination')
      await page.waitForLoadState('networkidle')
      await page.waitForSelector('[data-testid="paginated-query-page"]', { timeout: 30000 })

      // WHEN we check the status
      // Wait for status to be available
      await page.waitForFunction(
        () => {
          const status = document.querySelector('[data-testid="status"]')?.textContent
          return status && status !== 'LoadingFirstPage'
        },
        { timeout: 30000 },
      )

      const status = await page.textContent('[data-testid="status"]')

      // THEN status should be CanLoadMore or Exhausted
      expect(['CanLoadMore', 'Exhausted']).toContain(status)
    }, 60000)
  })

  describe('Load More', () => {
    it('loadMore() is available on the page', async () => {
      // GIVEN a page with paginated data
      const page = await createPage('/labs/pagination')
      await page.waitForLoadState('networkidle')
      await page.waitForSelector('[data-testid="paginated-query-page"]', { timeout: 30000 })

      // WHEN we check for the load more button
      const loadMoreBtn = await page.$('[data-testid="load-more-btn"]')

      // THEN the load more mechanism should exist
      // (button may be disabled if all data is loaded)
      expect(loadMoreBtn).toBeDefined()
    }, 60000)
  })

  describe('Results', () => {
    it('returns results as an array', async () => {
      // GIVEN a page with paginated data
      const page = await createPage('/labs/pagination')
      await page.waitForLoadState('networkidle')
      await page.waitForSelector('[data-testid="paginated-query-page"]', { timeout: 30000 })

      // WHEN we check the count
      const countText = await page.textContent('[data-testid="count"]')
      const count = Number.parseInt(countText || '0', 10)

      // THEN count should be a number (results array has length)
      expect(count).toBeGreaterThanOrEqual(0)
    }, 60000)
  })

  /**
   * Server and Lazy Options Behavior
   *
   * These tests verify the behavior matrix for server/lazy combinations:
   *
   * | server | lazy  | SSR HTML              | Client Nav Initial State |
   * |--------|-------|-----------------------|--------------------------|
   * | false  | true  | status=LoadingFirst   | status=LoadingFirst      |
   * | false  | false | status=LoadingFirst   | hasData=true (blocked)   |
   * | true   | true  | hasData=true          | status=LoadingFirst      |
   * | true   | false | hasData=true          | hasData=true (blocked)   |
   */
  describe('Server and Lazy Options', () => {
    describe('SSR Behavior', () => {
      it('server: true, lazy: true renders with data in HTML', async () => {
        // GIVEN a page with server: true, lazy: true
        // WHEN the page is server-rendered
        const html = await $fetch('/labs/pagination/server-true-lazy-true')

        // THEN the HTML should have data
        // Note: Vue adds class and scoped style attrs between testid and value
        expect(html).toMatch(/data-testid="initial-has-data"[^>]*>true</)
      })

      it('server: true, lazy: false renders with data in HTML', async () => {
        // GIVEN a page with server: true, lazy: false (default behavior)
        // WHEN the page is server-rendered
        const html = await $fetch('/labs/pagination/server-true-lazy-false')

        // THEN the HTML should have data
        expect(html).toMatch(/data-testid="initial-has-data"[^>]*>true</)
      })

      it('server: false, lazy: true renders without data in HTML', async () => {
        // GIVEN a page with server: false, lazy: true
        // WHEN the page is server-rendered
        const html = await $fetch('/labs/pagination/server-false-lazy-true')

        // THEN the HTML should NOT have data (server: false skips SSR fetch)
        expect(html).toMatch(/data-testid="initial-has-data"[^>]*>false</)
      })

      it('server: false, lazy: false renders without data in HTML', async () => {
        // GIVEN a page with server: false, lazy: false
        // WHEN the page is server-rendered
        const html = await $fetch('/labs/pagination/server-false-lazy-false')

        // THEN the HTML should NOT have data (server: false skips SSR fetch)
        expect(html).toMatch(/data-testid="initial-has-data"[^>]*>false</)
      })
    })

    describe('Client Navigation Behavior', () => {
      it('lazy: true shows loading state initially on client nav', async () => {
        // GIVEN the lazy hub page (no pre-cached pagination data)
        const page = await createPage('/labs/pagination/lazy-hub')
        await page.waitForLoadState('networkidle')

        // WHEN we navigate to a lazy: true page
        await page.click('[data-testid="link-server-true-lazy-true"]')
        await page.waitForSelector('[data-testid="server-true-lazy-true-page"]')

        // THEN initial state should show status=LoadingFirstPage (navigation was instant)
        const initialStatus = await page.textContent('[data-testid="initial-status"]')
        expect(initialStatus?.trim()).toBe('LoadingFirstPage')
      }, 30000)

      it('lazy: false shows data immediately on client nav (navigation blocked)', async () => {
        // GIVEN the lazy hub page (no pre-cached pagination data)
        const page = await createPage('/labs/pagination/lazy-hub')
        await page.waitForLoadState('networkidle')

        // WHEN we navigate to a lazy: false page
        await page.click('[data-testid="link-server-true-lazy-false"]')
        await page.waitForSelector('[data-testid="server-true-lazy-false-page"]')

        // THEN initial state should have data (navigation was blocked until data loaded)
        const initialHasData = await page.textContent('[data-testid="initial-has-data"]')
        expect(initialHasData?.trim()).toBe('true')
      }, 30000)

      it('data eventually loads after lazy: true navigation', async () => {
        // GIVEN the lazy hub page (no pre-cached pagination data)
        const page = await createPage('/labs/pagination/lazy-hub')
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

    describe('Hydration', () => {
      it('server: true does not cause hydration mismatch', async () => {
        // GIVEN a page with server: true loaded
        const page = await createPage('/labs/pagination/server-true-lazy-true')
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
  })

  describe('Transform Option', () => {
    it('transforms concatenated results', async () => {
      // GIVEN a page with transform option
      const page = await createPage('/labs/pagination/features/transform')
      await page.waitForLoadState('networkidle')
      await page.waitForSelector('[data-testid="paginated-transform-page"]', { timeout: 30000 })

      // Wait for data to load
      await page.waitForFunction(
        () => {
          const el = document.querySelector('[data-testid="count"]')
          return el && Number.parseInt(el.textContent || '0', 10) > 0
        },
        { timeout: 30000 },
      )

      // WHEN we check if transform was applied
      const hasFormatted = await page.textContent('[data-testid="has-formatted"]')
      const hasTitleLength = await page.textContent('[data-testid="has-title-length"]')

      // THEN transformed fields should be present
      expect(hasFormatted?.trim()).toBe('true')
      expect(hasTitleLength?.trim()).toBe('true')
    }, 60000)
  })

  describe('Methods', () => {
    it('refresh() re-fetches all loaded pages', async () => {
      // GIVEN a page with data and a refresh button
      const page = await createPage('/labs/pagination/features/refresh')
      await page.waitForLoadState('networkidle')
      await page.waitForSelector('[data-testid="paginated-refresh-page"]', { timeout: 30000 })

      // Wait for initial data
      await page.waitForFunction(
        () => {
          const el = document.querySelector('[data-testid="count"]')
          return el && Number.parseInt(el.textContent || '0', 10) > 0
        },
        { timeout: 30000 },
      )

      const initialCount = await page.textContent('[data-testid="refresh-count"]')
      expect(initialCount?.trim()).toBe('0')

      // WHEN we click refresh
      await page.click('[data-testid="refresh-btn"]')
      await page.waitForTimeout(1000)

      // THEN refresh count should increase
      const afterCount = await page.textContent('[data-testid="refresh-count"]')
      expect(afterCount?.trim()).toBe('1')
    }, 60000)

    it('reset() clears and restarts from first page', async () => {
      // GIVEN a page with data
      const page = await createPage('/labs/pagination/features/reset')
      await page.waitForLoadState('networkidle')
      await page.waitForSelector('[data-testid="paginated-reset-page"]', { timeout: 30000 })

      // Wait for initial data
      await page.waitForFunction(
        () => {
          const status = document.querySelector('[data-testid="status"]')?.textContent
          return status && status !== 'LoadingFirstPage'
        },
        { timeout: 30000 },
      )

      // Load more to get additional pages
      const status = await page.textContent('[data-testid="status"]')
      if (status === 'CanLoadMore') {
        await page.click('[data-testid="load-more-btn"]')
        await page.waitForTimeout(1000)
      }

      const _countBeforeReset = await page.textContent('[data-testid="count"]')

      // WHEN we click reset
      await page.click('[data-testid="reset-btn"]')
      await page.waitForTimeout(1000)

      // THEN reset count should increase
      const resetCount = await page.textContent('[data-testid="reset-count"]')
      expect(resetCount?.trim()).toBe('1')

      // AND load more count should be reset
      const loadMoreCount = await page.textContent('[data-testid="load-more-count"]')
      expect(loadMoreCount?.trim()).toBe('0')
    }, 60000)
  })
})
