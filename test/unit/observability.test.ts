import { describe, expect, it, vi } from 'vitest'

import {
  createObservationEmitter,
  normalizeObservabilityConfig,
  stripObservationArgs,
  withObservationArgs,
} from '../../src/runtime/utils/observability'

describe('observability', () => {
  it('normalizes defaults safely', () => {
    const config = normalizeObservabilityConfig({})
    expect(typeof config.enabled).toBe('boolean')
    expect(config.correlation.header).toBe('x-trellis-correlation-id')
  })

  it('emits redacted semantic events to adapters', async () => {
    const adapter = vi.fn()
    const emitter = createObservationEmitter(
      {
        enabled: true,
        adapter,
        level: 'verbose',
        capture: { backend: true, mcp: true, browser: true },
      },
      {
        transport: 'convex',
        correlationId: 'corr_test',
      },
    )

    await emitter.emit({
      name: 'db.raw.used',
      status: 'success',
      details: {
        token: 'secret',
        table: 'posts',
      },
    })

    expect(adapter).toHaveBeenCalledTimes(1)
    const event = adapter.mock.calls[0]?.[0]
    expect(event.correlationId).toBe('corr_test')
    expect(event.details).toEqual({
      token: '[redacted]',
      table: 'posts',
    })
  })

  it('adds and strips hidden observation args', () => {
    const args = withObservationArgs({ id: '123' }, { correlationId: 'corr_123', transport: 'mcp' })
    expect(args).toMatchObject({
      id: '123',
      _trellisCorrelationId: 'corr_123',
      _trellisTransport: 'mcp',
    })
    expect(stripObservationArgs(args)).toEqual({ id: '123' })
  })
})
