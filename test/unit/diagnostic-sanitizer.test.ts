import { afterEach, describe, expect, it, vi } from 'vitest'

import { createLogger } from '../../src/runtime/utils/logger'
import { sanitizeDiagnosticValue } from '../../src/runtime/utils/sanitize-diagnostic'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('sanitizeDiagnosticValue', () => {
  it('redacts nested secrets, bounds strings, and handles circular and bigint values', () => {
    const input: Record<string, unknown> = {
      authorization: 'Bearer private',
      nested: { sessionToken: 'private', value: 12n },
      long: 'x'.repeat(600),
    }
    input.circular = input

    expect(sanitizeDiagnosticValue(input)).toEqual({
      authorization: '[Redacted]',
      nested: { sessionToken: '[Redacted]', value: '12n' },
      long: `${'x'.repeat(512)}[Truncated]`,
      circular: '[Circular]',
    })
  })

  it('does not invoke accessors and survives hostile proxies', () => {
    const getter = vi.fn(() => 'private')
    const value = Object.defineProperty({}, 'tokenFromGetter', { get: getter, enumerable: true })
    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('blocked')
        },
      },
    )

    expect(sanitizeDiagnosticValue(value)).toEqual({ tokenFromGetter: '[Redacted]' })
    expect(getter).not.toHaveBeenCalled()
    expect(sanitizeDiagnosticValue(hostile)).toBe('[Unreadable]')
  })

  it('keeps logger methods immutable and prevents hostile data from breaking logging', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const logger = createLogger('debug')
    const hostile = Object.defineProperty({ password: 'private' }, 'boom', {
      get() {
        throw new Error('must not run')
      },
      enumerable: true,
    })

    expect(() => logger.debug('diagnostic', hostile)).not.toThrow()
    expect(log).toHaveBeenCalled()
    expect(JSON.stringify(log.mock.calls)).not.toContain('private')
    expect(Object.isFrozen(logger)).toBe(true)
  })
})
