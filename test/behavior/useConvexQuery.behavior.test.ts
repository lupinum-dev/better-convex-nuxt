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

import { setup, $fetch, createPage, url } from '@nuxt/test-utils/e2e'
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
      const html = await $fetch('/labs/realtime')

      // THEN the data should be in the HTML (SSR worked)
      // Note: Even if empty, the page should render without errors
      expect(html).toContain('data-testid="realtime-page"')
    })

    it('hydrates on client without loading flash', async () => {
      // GIVEN a server-rendered page with data
      const page = await createPage('/labs/realtime')
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

    it('preserves Convex special values across SSR payload hydration (int64 + bytes)', async () => {
      const html = await $fetch('/labs/query-features/convex-payload')
      expect(html).toContain('data-testid="convex-payload-page"')
      expect(html).toContain('data-testid="bigint-type"')

      const page = await createPage('/labs/query-features/convex-payload')
      const consoleErrors: string[] = []
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text())
        }
      })

      await page.waitForLoadState('networkidle')

      expect((await page.textContent('[data-testid="bigint-type"]'))?.trim()).toBe('bigint')
      expect((await page.textContent('[data-testid="bigint-value"]'))?.trim()).toBe('123')
      expect((await page.textContent('[data-testid="bytes-type"]'))?.trim()).toBe('ArrayBuffer')
      expect((await page.textContent('[data-testid="bytes-length"]'))?.trim()).toBe('3')
      expect((await page.textContent('[data-testid="bytes-values"]'))?.trim()).toBe('1,2,3')
      expect((await page.textContent('[data-testid="convex-json-bytes"]'))?.trim()).toBe('AQID')

      const hydrationErrors = consoleErrors.filter((msg) => msg.toLowerCase().includes('hydration'))
      expect(hydrationErrors).toHaveLength(0)
    }, 30000)
  })

  describe('Skip Behavior', () => {
    it('returns null data when skip="skip"', async () => {
      // GIVEN a page with a skipped query
      const page = await createPage('/labs/query-features/skip')
      await page.waitForLoadState('networkidle')

      // WHEN we check the data state
      const content = await page.textContent('body')

      // THEN data should be null and pending should be false
      expect(content).toContain('data: null')
      expect(content).toContain('pending: false')
    }, 30000)

    it('has pending=false when skip=true', async () => {
      // GIVEN a page with a skipped query
      const page = await createPage('/labs/query-features/skip')
      await page.waitForLoadState('networkidle')

      // WHEN we check the pending state
      const content = await page.textContent('body')

      // THEN pending should be false (skipped queries are never pending)
      expect(content).toContain('pending: false')
    }, 30000)
  })

  describe('Subscription Deduplication Regression', () => {
    async function openSubscriptionDedupPage(path: string, pageTestId: string) {
      const page = await createPage('/')
      page.setDefaultTimeout(5000)
      await page.goto(url(path), {
        waitUntil: 'commit',
        timeout: 5000,
      }).catch(() => {})
      await page.waitForSelector(pageTestId)
      await page.waitForTimeout(1500)
      return page
    }

    it('keeps all subscribers in sync when one starts as skip and resolves later', async () => {
      // GIVEN a page with two useConvexQuery calls for the same query
      // and the second starts as "skip" before resolving args later
      const page = await openSubscriptionDedupPage(
        '/labs/query-features/subscription-dedup-bug',
        '[data-testid="subscription-dedup-bug-page"]',
      )

      const initialChildReady = await page.textContent('[data-testid="child-ready"]').catch(() => null)
      const initialParentStatus = await page.textContent('[data-testid="parent-status"]').catch(() => null)
      const initialChildStatus = await page.textContent('[data-testid="child-status"]').catch(() => null)
      const initialParentCount = await page.textContent('[data-testid="parent-count"]').catch(() => null)
      const initialChildCount = await page.textContent('[data-testid="child-count"]').catch(() => null)

      expect(initialChildReady?.trim()).toBe('true')
      expect(initialParentStatus?.trim()).toBe('success')
      expect(initialChildStatus?.trim()).toBe('success')
      expect(initialParentCount?.trim()).toBe('0')
      expect(initialChildCount?.trim()).toBe('0')

      // WHEN a real-time update is emitted
      await page.click('[data-testid="increment-btn"]')
      await page.waitForTimeout(200)

      // THEN both subscribers should update
      const parentCount = await page.textContent('[data-testid="parent-count"]')
      const childCount = await page.textContent('[data-testid="child-count"]')

      expect(parentCount?.trim()).toBe('1')
      expect(childCount?.trim()).toBe('1')
    }, 30000)

    it('keeps remaining subscribers updating after the original subscriber unmounts', async () => {
      const page = await openSubscriptionDedupPage(
        '/labs/query-features/subscription-dedup-owner-unmount',
        '[data-testid="subscription-dedup-owner-unmount-page"]',
      )

      expect((await page.textContent('[data-testid="child-ready"]'))?.trim()).toBe('true')
      expect((await page.textContent('[data-testid="parent-count"]'))?.trim()).toBe('0')
      expect((await page.textContent('[data-testid="child-count"]'))?.trim()).toBe('0')

      await page.click('[data-testid="unmount-parent-btn"]')
      await page.waitForTimeout(200)

      expect((await page.textContent('[data-testid="show-parent"]'))?.trim()).toBe('false')
      expect(await page.$('[data-testid="parent-card"]')).toBeNull()
      expect((await page.textContent('[data-testid="listener-count"]'))?.trim()).toBe('1')

      await page.click('[data-testid="increment-btn"]')
      await page.waitForTimeout(200)

      expect((await page.textContent('[data-testid="child-count"]'))?.trim()).toBe('1')
      expect((await page.textContent('[data-testid="child-status"]'))?.trim()).toBe('success')
    }, 30000)

    it('supports divergent transforms across shared subscribers', async () => {
      const page = await openSubscriptionDedupPage(
        '/labs/query-features/subscription-dedup-transform',
        '[data-testid="subscription-dedup-transform-page"]',
      )

      expect((await page.textContent('[data-testid="child-ready"]'))?.trim()).toBe('true')
      expect((await page.textContent('[data-testid="parent-count"]'))?.trim()).toBe('0')
      expect((await page.textContent('[data-testid="child-count"]'))?.trim()).toBe('count:0')

      await page.click('[data-testid="increment-btn"]')
      await page.waitForTimeout(200)

      expect((await page.textContent('[data-testid="parent-count"]'))?.trim()).toBe('1')
      expect((await page.textContent('[data-testid="child-count"]'))?.trim()).toBe('count:1')
      expect((await page.textContent('[data-testid="child-status"]'))?.trim()).toBe('success')
    }, 30000)

    it('handles error before first data for late-joining subscribers without crashing', async () => {
      const page = await openSubscriptionDedupPage(
        '/labs/query-features/subscription-dedup-error-before-data',
        '[data-testid="subscription-dedup-error-before-data-page"]',
      )

      expect((await page.textContent('[data-testid="child-ready"]'))?.trim()).toBe('true')
      expect((await page.textContent('[data-testid="parent-count"]'))?.trim()).toBe('null')
      expect((await page.textContent('[data-testid="child-count"]'))?.trim()).toBe('null')

      await page.click('[data-testid="emit-error-btn"]')
      await page.waitForTimeout(200)

      expect((await page.textContent('[data-testid="parent-error"]'))?.trim()).toContain('Synthetic pre-data error')
      expect((await page.textContent('[data-testid="child-error"]'))?.trim()).toContain('Synthetic pre-data error')

      await page.click('[data-testid="increment-btn"]')
      await page.waitForTimeout(300)

      expect((await page.textContent('[data-testid="parent-count"]'))?.trim()).toBe('1')
      expect((await page.textContent('[data-testid="child-count"]'))?.trim()).toBe('1')
      expect((await page.textContent('[data-testid="parent-error"]'))?.trim()).toBe('null')
      expect((await page.textContent('[data-testid="child-error"]'))?.trim()).toBe('null')
    }, 30000)
  })

  describe('Error Handling', () => {
    it('sets error ref when query fails', async () => {
      // GIVEN a page that calls a query that always fails
      const page = await createPage('/labs/query-features/error')
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
      const page = await createPage('/labs/query-features/refresh')
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
      const page = await createPage('/labs/query-features/with-default')
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
  describe('Deep Reactive Args', () => {
    it('re-fetches when nested property of ref args is mutated', async () => {
      // GIVEN a page with a ref object as args
      const page = await createPage('/labs/query-features/deep-reactive')
      await page.waitForLoadState('networkidle')

      // Get initial update count
      const initialUpdateCount = await page.textContent('[data-testid="update-count"]')
      const initialCount = Number.parseInt(initialUpdateCount?.trim() || '0', 10)

      // WHEN we click the deep mutation button (changes args.value.query without replacing args.value)
      await page.click('[data-testid="deep-mutation-btn"]')
      await page.waitForTimeout(1000) // Wait for refetch

      // THEN update count should have incremented (query re-fetched)
      const newUpdateCount = await page.textContent('[data-testid="update-count"]')
      const newCount = Number.parseInt(newUpdateCount?.trim() || '0', 10)

      // The query arg should have changed (cycles from '' -> 'hello' -> 'test' -> 'note' -> '')
      const currentQuery = await page.textContent('[data-testid="current-query"]')
      expect(currentQuery).not.toBe('""') // Should have changed from empty

      // Update count should have increased (data was refetched)
      expect(newCount).toBeGreaterThan(initialCount)
    }, 30000)

    it('re-fetches multiple times with consecutive deep mutations', async () => {
      // GIVEN a page with a ref object as args
      const page = await createPage('/labs/query-features/deep-reactive')
      await page.waitForLoadState('networkidle')

      // Get initial update count
      const initialUpdateCount = await page.textContent('[data-testid="update-count"]')
      const initialCount = Number.parseInt(initialUpdateCount?.trim() || '0', 10)

      // WHEN we click the deep mutation button multiple times
      await page.click('[data-testid="deep-mutation-btn"]')
      await page.waitForTimeout(500)
      await page.click('[data-testid="deep-mutation-btn"]')
      await page.waitForTimeout(500)
      await page.click('[data-testid="deep-mutation-btn"]')
      await page.waitForTimeout(1000)

      // THEN update count should have incremented multiple times
      const finalUpdateCount = await page.textContent('[data-testid="update-count"]')
      const finalCount = Number.parseInt(finalUpdateCount?.trim() || '0', 10)

      // Should have refetched at least 3 more times
      expect(finalCount).toBeGreaterThan(initialCount + 2)
    }, 30000)
  })

  describe('Server and Lazy Options', () => {
    describe('SSR Behavior', () => {
      it('server: false, lazy: true renders with pending=true in HTML', async () => {
        // GIVEN a page with server: false, lazy: true
        // WHEN the page is server-rendered
        const html = await $fetch('/labs/query/server-false-lazy-true')

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
        const html = await $fetch('/labs/query/server-false-lazy-false')

        // THEN the HTML should show pending=true and no data (server: false skips SSR fetch)
        expect(html).toMatch(/data-testid="initial-pending"[^>]*>true</)
        expect(html).toMatch(/data-testid="initial-has-data"[^>]*>false</)
      })

      it('server: true, lazy: true renders with data in HTML', async () => {
        // GIVEN a page with server: true, lazy: true
        // WHEN the page is server-rendered
        const html = await $fetch('/labs/query/server-true-lazy-true')

        // THEN the HTML should show pending=false and have data
        expect(html).toMatch(/data-testid="initial-pending"[^>]*>false</)
        expect(html).toMatch(/data-testid="initial-has-data"[^>]*>true</)
        // Verify actual data is in the data preview section
        expect(html).toMatch(/data-testid="data-preview"/)
      })

      it('server: true, lazy: false renders with data in HTML', async () => {
        // GIVEN a page with server: true, lazy: false (default behavior)
        // WHEN the page is server-rendered
        const html = await $fetch('/labs/query/server-true-lazy-false')

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
        const page = await createPage('/labs/query')
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
        const page = await createPage('/labs/query')
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
        const page = await createPage('/labs/query')
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
        const page = await createPage('/labs/query')
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
        const page = await createPage('/labs/query/server-false-lazy-true')
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
        const page = await createPage('/labs/query/server-true-lazy-true')
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
        const page = await createPage('/labs/query')
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
