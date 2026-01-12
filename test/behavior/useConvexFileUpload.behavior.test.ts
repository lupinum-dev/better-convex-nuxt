/**
 * useConvexFileUpload Behavior Tests
 *
 * Documents the PUBLIC CONTRACT of useConvexFileUpload.
 * These tests define what users can rely on.
 *
 * Add tests here when:
 * - A bug is reported (TDD: write failing test first)
 * - A new feature is added
 */

import { setup, createPage } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import * as path from 'node:path'
import * as fs from 'node:fs'
import * as os from 'node:os'

describe('useConvexFileUpload behavior', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../../playground', import.meta.url)),
  })

  // Helper to create a test image file
  function createTestImagePath(): string {
    const tmpDir = os.tmpdir()
    const filePath = path.join(tmpDir, 'test-image.png')

    // Create a minimal valid PNG (1x1 red pixel)
    // Using base64 to avoid hex literal casing issues
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='
    const pngData = Buffer.from(pngBase64, 'base64')

    fs.writeFileSync(filePath, pngData)
    return filePath
  }

  // ============================================================================
  // Initial State
  // ============================================================================

  describe('Initial State', () => {
    it('starts in idle status', async () => {
      // GIVEN a page with file upload
      const page = await createPage('/test-file-upload/status')
      await page.waitForLoadState('networkidle')

      // WHEN we check initial state
      const status = await page.textContent('[data-testid="status"]')

      // THEN status should be idle
      expect(status).toBe('idle')
    }, 30000)

    it('pending is false initially', async () => {
      // GIVEN a page with file upload
      const page = await createPage('/test-file-upload/status')
      await page.waitForLoadState('networkidle')

      // WHEN we check initial pending state
      const pending = await page.textContent('[data-testid="pending"]')

      // THEN pending should be false
      expect(pending).toBe('false')
    }, 30000)

    it('progress is 0 initially', async () => {
      // GIVEN a page with file upload
      const page = await createPage('/test-file-upload/status')
      await page.waitForLoadState('networkidle')

      // WHEN we check initial progress
      const progress = await page.textContent('[data-testid="progress"]')

      // THEN progress should be 0
      expect(progress).toBe('0')
    }, 30000)

    it('storageId is undefined initially', async () => {
      // GIVEN a page with file upload
      const page = await createPage('/test-file-upload/status')
      await page.waitForLoadState('networkidle')

      // WHEN we check initial storageId
      const storageId = await page.textContent('[data-testid="storage-id"]')

      // THEN storageId should be undefined
      expect(storageId).toBe('undefined')
    }, 30000)

    it('error is null initially', async () => {
      // GIVEN a page with file upload
      const page = await createPage('/test-file-upload/status')
      await page.waitForLoadState('networkidle')

      // WHEN we check initial error
      const error = await page.textContent('[data-testid="error"]')

      // THEN error should be null
      expect(error).toBe('null')
    }, 30000)
  })

  // ============================================================================
  // Status Transitions
  // ============================================================================

  describe('Status Transitions', () => {
    it('transitions to pending during upload', async () => {
      // GIVEN a page with file upload
      const page = await createPage('/test-file-upload/status')
      await page.waitForLoadState('networkidle')

      const testImagePath = createTestImagePath()

      // WHEN we start an upload
      const fileInput = page.locator('[data-testid="file-input"]')
      await fileInput.setInputFiles(testImagePath)

      // THEN status should transition to pending
      const pendingStatus = await page.waitForFunction(() => {
        const el = document.querySelector('[data-testid="status"]')
        return el?.textContent === 'pending'
      }, { timeout: 5000 }).then(() => 'pending').catch(() => 'not-pending')

      expect(pendingStatus).toBe('pending')
    }, 30000)

    it('transitions to success after successful upload', async () => {
      // GIVEN a page with file upload
      const page = await createPage('/test-file-upload/status')
      await page.waitForLoadState('networkidle')

      const testImagePath = createTestImagePath()

      // WHEN we upload a file and wait for completion
      const fileInput = page.locator('[data-testid="file-input"]')
      await fileInput.setInputFiles(testImagePath)

      await page.waitForFunction(() => {
        const el = document.querySelector('[data-testid="status"]')
        return el?.textContent === 'success'
      }, { timeout: 30000 })

      // THEN status should be success
      const status = await page.textContent('[data-testid="status"]')
      expect(status).toBe('success')
    }, 60000)

    it('storageId is set after successful upload', async () => {
      // GIVEN a page with file upload
      const page = await createPage('/test-file-upload/status')
      await page.waitForLoadState('networkidle')

      const testImagePath = createTestImagePath()

      // WHEN we upload a file and wait for completion
      const fileInput = page.locator('[data-testid="file-input"]')
      await fileInput.setInputFiles(testImagePath)

      await page.waitForFunction(() => {
        const el = document.querySelector('[data-testid="status"]')
        return el?.textContent === 'success'
      }, { timeout: 30000 })

      // THEN storageId should be set
      const storageId = await page.textContent('[data-testid="storage-id"]')
      expect(storageId).not.toBe('undefined')
      // Convex storage IDs have a specific format
      expect(storageId).toMatch(/^[a-z0-9]+$/)
    }, 60000)
  })

  // ============================================================================
  // Progress Tracking
  // ============================================================================

  describe('Progress Tracking', () => {
    it('progress updates during upload', async () => {
      // GIVEN a page with file upload
      const page = await createPage('/test-file-upload/status')
      await page.waitForLoadState('networkidle')

      const testImagePath = createTestImagePath()

      // WHEN we start an upload
      const fileInput = page.locator('[data-testid="file-input"]')
      await fileInput.setInputFiles(testImagePath)

      // Wait for upload to complete
      await page.waitForFunction(() => {
        const el = document.querySelector('[data-testid="status"]')
        return el?.textContent === 'success'
      }, { timeout: 30000 })

      // THEN progress should reach 100
      const progress = await page.textContent('[data-testid="progress"]')
      expect(Number.parseInt(progress || '0', 10)).toBe(100)
    }, 60000)
  })

  // ============================================================================
  // Cancel Function
  // ============================================================================

  describe('Cancel Function', () => {
    it('cancel button is disabled when not pending', async () => {
      // GIVEN a page with file upload in idle state
      const page = await createPage('/test-file-upload/status')
      await page.waitForLoadState('networkidle')

      // WHEN we check the cancel button
      const cancelBtn = page.locator('[data-testid="cancel-btn"]')

      // THEN it should be disabled
      const isDisabled = await cancelBtn.isDisabled()
      expect(isDisabled).toBe(true)
    }, 30000)

    it('cancel clears storageId', async () => {
      // GIVEN a successful upload
      const page = await createPage('/test-file-upload/status')
      await page.waitForLoadState('networkidle')

      const testImagePath = createTestImagePath()
      const fileInput = page.locator('[data-testid="file-input"]')
      await fileInput.setInputFiles(testImagePath)

      await page.waitForFunction(() => {
        const el = document.querySelector('[data-testid="status"]')
        return el?.textContent === 'success'
      }, { timeout: 30000 })

      // Verify storageId is set
      let storageId = await page.textContent('[data-testid="storage-id"]')
      expect(storageId).not.toBe('undefined')

      // Start a new upload to enable cancel button
      await fileInput.setInputFiles(testImagePath)

      // Wait for pending state
      await page.waitForFunction(() => {
        const el = document.querySelector('[data-testid="status"]')
        return el?.textContent === 'pending'
      }, { timeout: 5000 })

      // WHEN we cancel
      await page.click('[data-testid="cancel-btn"]')

      // THEN storageId should be cleared
      await page.waitForFunction(() => {
        const el = document.querySelector('[data-testid="storage-id"]')
        return el?.textContent === 'undefined'
      }, { timeout: 5000 })

      storageId = await page.textContent('[data-testid="storage-id"]')
      expect(storageId).toBe('undefined')
    }, 60000)
  })

  // ============================================================================
  // useConvexStorageUrl Integration
  // ============================================================================

  describe('useConvexStorageUrl Integration', () => {
    it('imageUrl is set after successful upload', async () => {
      // GIVEN a page with file upload and storage URL
      const page = await createPage('/test-file-upload/status')
      await page.waitForLoadState('networkidle')

      const testImagePath = createTestImagePath()

      // WHEN we upload a file
      const fileInput = page.locator('[data-testid="file-input"]')
      await fileInput.setInputFiles(testImagePath)

      // Wait for upload to complete
      await page.waitForFunction(() => {
        const el = document.querySelector('[data-testid="status"]')
        return el?.textContent === 'success'
      }, { timeout: 30000 })

      // Wait for URL to be fetched
      await page.waitForFunction(() => {
        const el = document.querySelector('[data-testid="image-url"]')
        return el?.textContent !== 'null'
      }, { timeout: 10000 })

      // THEN imageUrl should be a valid URL
      const imageUrl = await page.textContent('[data-testid="image-url"]')
      expect(imageUrl).not.toBe('null')
      expect(imageUrl).toContain('https://')
    }, 60000)

    it('preview image is displayed after upload', async () => {
      // GIVEN a page with file upload
      const page = await createPage('/test-file-upload/status')
      await page.waitForLoadState('networkidle')

      const testImagePath = createTestImagePath()

      // WHEN we upload a file
      const fileInput = page.locator('[data-testid="file-input"]')
      await fileInput.setInputFiles(testImagePath)

      // Wait for upload and URL fetch
      await page.waitForFunction(() => {
        const el = document.querySelector('[data-testid="image-url"]')
        return el?.textContent !== 'null'
      }, { timeout: 30000 })

      // Wait for the preview image element to appear in DOM
      await page.waitForSelector('[data-testid="preview-image"]', { timeout: 10000 })

      // THEN preview image should be visible
      const previewImage = page.locator('[data-testid="preview-image"]')
      const isVisible = await previewImage.isVisible()
      expect(isVisible).toBe(true)
    }, 60000)
  })

  // ============================================================================
  // Multiple Uploads
  // ============================================================================

  describe('Multiple Uploads', () => {
    it('can upload multiple files sequentially', async () => {
      // GIVEN a page with file upload
      const page = await createPage('/test-file-upload/status')
      await page.waitForLoadState('networkidle')

      const testImagePath = createTestImagePath()
      const fileInput = page.locator('[data-testid="file-input"]')

      // WHEN we upload multiple files
      for (let i = 0; i < 2; i++) {
        await fileInput.setInputFiles(testImagePath)

        await page.waitForFunction(() => {
          const el = document.querySelector('[data-testid="status"]')
          return el?.textContent === 'success'
        }, { timeout: 30000 })
      }

      // THEN success count should be 2
      const count = await page.textContent('[data-testid="success-count"]')
      expect(count).toBe('2')
    }, 120000)
  })
})
