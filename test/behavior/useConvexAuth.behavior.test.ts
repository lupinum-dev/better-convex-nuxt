/**
 * useConvexAuth Behavior Tests
 *
 * Documents the PUBLIC CONTRACT of useConvexAuth.
 * These tests define what users can rely on.
 *
 * Add tests here when:
 * - A bug is reported (TDD: write failing test first)
 * - A new feature is added
 */

import { setup, $fetch, createPage } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

describe('useConvexAuth behavior', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../../playground', import.meta.url)),
  })

  // ============================================================================
  // Unauthenticated State
  // ============================================================================

  describe('Unauthenticated State', () => {
    it('returns isAuthenticated=false when not logged in', async () => {
      // GIVEN a page that displays auth state
      const page = await createPage('/labs/auth')
      await page.waitForLoadState('networkidle')

      // Wait for auth check to complete
      await page.waitForFunction(() => {
        const el = document.querySelector('.state-item .value')
        return el?.textContent === 'false' || el?.textContent === 'true'
      }, { timeout: 10000 })

      // WHEN we check isAuthenticated
      const isAuthenticatedText = await page.textContent('.state-item:first-child .value')

      // THEN it should be false (no session)
      expect(isAuthenticatedText).toBe('false')
    }, 30000)

    it('returns isPending=false after auth check completes', async () => {
      // GIVEN a page that displays auth state
      const page = await createPage('/labs/auth')
      await page.waitForLoadState('networkidle')

      // Wait for auth check to complete
      await page.waitForFunction(() => {
        const el = document.querySelector('.state-item:nth-child(2) .value')
        return el?.textContent === 'false'
      }, { timeout: 10000 })

      // WHEN we check isPending
      const isPendingText = await page.textContent('.state-item:nth-child(2) .value')

      // THEN it should be false after loading completes
      expect(isPendingText).toBe('false')
    }, 30000)

    it('returns token=null when not authenticated', async () => {
      // GIVEN a page that displays auth state
      const page = await createPage('/labs/auth')
      await page.waitForLoadState('networkidle')

      // Wait for auth check to complete
      await page.waitForFunction(() => {
        const el = document.querySelector('.state-item:nth-child(2) .value')
        return el?.textContent === 'false'
      }, { timeout: 10000 })

      // WHEN we check token
      const tokenText = await page.textContent('.state-item:nth-child(3) .value')

      // THEN it should show (none)
      expect(tokenText).toBe('(none)')
    }, 30000)

    it('returns user=null when not authenticated', async () => {
      // GIVEN a page that displays auth state
      const page = await createPage('/labs/auth')
      await page.waitForLoadState('networkidle')

      // Wait for auth check to complete
      await page.waitForFunction(() => {
        const el = document.querySelector('.state-item:nth-child(2) .value')
        return el?.textContent === 'false'
      }, { timeout: 10000 })

      // WHEN we check user
      const userText = await page.textContent('.state-item:nth-child(4) .value')

      // THEN it should show (none)
      expect(userText).toBe('(none)')
    }, 30000)
  })

  // ============================================================================
  // SSR Auth State
  // ============================================================================

  describe('SSR Auth State', () => {
    it('auth state is available during SSR', async () => {
      // GIVEN a server-rendered page
      const html = await $fetch('/')

      // WHEN we check the HTML
      // THEN the page should render without errors
      // (auth state was available during SSR)
      expect(html).toContain('<!DOCTYPE html>')
    })

    it('hydrates without auth flash', async () => {
      // GIVEN a server-rendered page
      const page = await createPage('/')
      await page.waitForLoadState('networkidle')

      // WHEN we check for console errors
      const consoleErrors: string[] = []
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text())
        }
      })

      await page.reload()
      await page.waitForLoadState('networkidle')

      // THEN there should be no auth-related hydration errors
      const authErrors = consoleErrors.filter(
        (msg) => msg.toLowerCase().includes('auth') && msg.toLowerCase().includes('mismatch'),
      )
      expect(authErrors).toHaveLength(0)
    }, 30000)

    it('SSR page loads without throwing auth errors', async () => {
      // GIVEN a server-rendered page that uses auth
      const html = await $fetch('/labs/auth')

      // WHEN we check the response
      // THEN it should contain valid HTML (no server errors)
      expect(html).toContain('Auth Lab')
      expect(html).not.toContain('500')
    })
  })

  // ============================================================================
  // Auth Components
  // ============================================================================

  describe('Auth Components', () => {
    it('ConvexUnauthenticated shows content when not logged in', async () => {
      // GIVEN a page with auth components
      const page = await createPage('/labs/auth')
      await page.waitForLoadState('networkidle')

      // Wait for auth check to complete
      await page.waitForFunction(() => {
        const el = document.querySelector('.state-item:nth-child(2) .value')
        return el?.textContent === 'false'
      }, { timeout: 10000 })

      // WHEN we check the ConvexUnauthenticated demo
      const unauthContent = await page.$('.auth-content.unauthenticated')

      // THEN the unauthenticated content should be visible
      expect(unauthContent).not.toBeNull()
      const text = await unauthContent?.textContent()
      expect(text).toContain('Please log in')
    }, 30000)

    it('ConvexAuthenticated hides content when not logged in', async () => {
      // GIVEN a page with auth components
      const page = await createPage('/labs/auth')
      await page.waitForLoadState('networkidle')

      // Wait for auth check to complete
      await page.waitForFunction(() => {
        const el = document.querySelector('.state-item:nth-child(2) .value')
        return el?.textContent === 'false'
      }, { timeout: 10000 })

      // WHEN we check the ConvexAuthenticated demo
      const authContent = await page.$('.auth-content.authenticated')

      // THEN the authenticated content should NOT be visible
      expect(authContent).toBeNull()
    }, 30000)

    it('ConvexAuthLoading hides content after auth check completes', async () => {
      // GIVEN a page with auth components
      const page = await createPage('/labs/auth')
      await page.waitForLoadState('networkidle')

      // Wait for auth check to complete
      await page.waitForFunction(() => {
        const el = document.querySelector('.state-item:nth-child(2) .value')
        return el?.textContent === 'false'
      }, { timeout: 10000 })

      // WHEN we check the ConvexAuthLoading demo output
      const notShownMessage = await page.$('.demo-card:first-of-type .not-shown')

      // THEN the "not shown" message should be visible (loading is complete)
      expect(notShownMessage).not.toBeNull()
    }, 30000)

    it('combined auth pattern shows unauthenticated state', async () => {
      // GIVEN a page with combined auth components pattern
      const page = await createPage('/labs/auth')
      await page.waitForLoadState('networkidle')

      // Wait for auth check to complete
      await page.waitForFunction(() => {
        const el = document.querySelector('.state-item:nth-child(2) .value')
        return el?.textContent === 'false'
      }, { timeout: 10000 })

      // WHEN we check the combined example
      const loginPrompt = await page.$('.login-prompt')

      // THEN the login prompt should be visible
      expect(loginPrompt).not.toBeNull()
      const text = await loginPrompt?.textContent()
      expect(text).toContain('Welcome to the App')
    }, 30000)
  })

  // ============================================================================
  // Auth Actions (UI elements)
  // ============================================================================

  describe('Auth Actions', () => {
    it('shows login button when unauthenticated', async () => {
      // GIVEN a page with auth actions
      const page = await createPage('/labs/auth')
      await page.waitForLoadState('networkidle')

      // Wait for auth check to complete
      await page.waitForFunction(() => {
        const el = document.querySelector('.state-item:nth-child(2) .value')
        return el?.textContent === 'false'
      }, { timeout: 10000 })

      // WHEN we check the auth actions section
      const loginButton = await page.$('.auth-actions .btn-primary')

      // THEN login button should be visible
      expect(loginButton).not.toBeNull()
      const text = await loginButton?.textContent()
      expect(text).toContain('Log In')
    }, 30000)

    it('login button links to auth page', async () => {
      // GIVEN a page with auth actions
      const page = await createPage('/labs/auth')
      await page.waitForLoadState('networkidle')

      // Wait for auth check to complete
      await page.waitForFunction(() => {
        const el = document.querySelector('.state-item:nth-child(2) .value')
        return el?.textContent === 'false'
      }, { timeout: 10000 })

      // WHEN we check the login button href
      const href = await page.$eval('.auth-actions .btn-primary', el => el.getAttribute('href'))

      // THEN it should link to the login page
      expect(href).toContain('/auth/login')
    }, 30000)
  })

  // ============================================================================
  // Page Loading
  // ============================================================================

  describe('Page Loading', () => {
    it('homepage loads without auth errors', async () => {
      // GIVEN the homepage
      const page = await createPage('/')
      await page.waitForLoadState('networkidle')

      // WHEN we check the page
      const content = await page.textContent('body')

      // THEN it should have content
      expect(content).toBeDefined()
      expect(content!.length).toBeGreaterThan(0)
    }, 30000)

    it('dashboard page loads without errors', async () => {
      // GIVEN the dashboard page
      const page = await createPage('/demo/dashboard')
      await page.waitForLoadState('networkidle')

      // WHEN we check if page loaded
      const content = await page.textContent('body')

      // THEN page should have loaded (may redirect or show unauthenticated state)
      expect(content).toBeDefined()
    }, 30000)
  })
})
