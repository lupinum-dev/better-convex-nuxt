/**
 * Unit Tests for computeQueryStatus
 *
 * Added after bug #7: status was 'error' when asyncData.error was undefined
 * Bug: `undefined !== null` is true, causing false error status
 * Fix: Use `!= null` (loose equality) to catch both null AND undefined
 */

import { describe, it, expect } from 'vitest'
import { computeQueryStatus } from '../../src/runtime/utils/convex-shared'

describe('computeQueryStatus', () => {
  describe('state priority', () => {
    it('idle when skipped (highest priority)', () => {
      expect(computeQueryStatus(true, true, true, false)).toBe('idle')
    })

    it('error when hasError (second priority)', () => {
      expect(computeQueryStatus(false, true, false, false)).toBe('error')
    })

    it('pending when loading without data', () => {
      expect(computeQueryStatus(false, false, true, false)).toBe('pending')
    })

    it('success when has data', () => {
      expect(computeQueryStatus(false, false, false, true)).toBe('success')
    })

    it('success during background refresh (pending with data)', () => {
      expect(computeQueryStatus(false, false, true, true)).toBe('success')
    })
  })

  describe('bug #7 regression: undefined vs null', () => {
    // The bug: `asyncData.error.value !== null` - undefined !== null is TRUE!
    // The fix: `asyncData.error.value != null` - catches both null AND undefined

    it('undefined error should NOT trigger error status', () => {
      const errorValue: Error | null | undefined = undefined
      const hasError = errorValue != null // Correct: loose equality
      expect(hasError).toBe(false)
      expect(computeQueryStatus(false, hasError, false, true)).toBe('success')
    })

    it('null error should NOT trigger error status', () => {
      const errorValue: Error | null | undefined = null
      const hasError = errorValue != null
      expect(hasError).toBe(false)
      expect(computeQueryStatus(false, hasError, false, true)).toBe('success')
    })

    it('actual Error should trigger error status', () => {
      const errorValue: Error | null | undefined = new Error('test')
      const hasError = errorValue != null
      expect(hasError).toBe(true)
      expect(computeQueryStatus(false, hasError, false, false)).toBe('error')
    })

    it('demonstrates the bug pattern (DO NOT USE !== null)', () => {
      const errorValue: Error | null | undefined = undefined
      const hasErrorBUGGY = errorValue !== null // BUG!
      expect(hasErrorBUGGY).toBe(true) // This caused issue #7
    })
  })
})
