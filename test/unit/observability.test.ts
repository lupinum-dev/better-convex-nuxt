import { describe, expect, it, vi } from 'vitest'

import {
  createObservationEmitter,
  normalizeObservabilityConfig,
  getObservationEnvelope,
  stripObservationEnvelope,
  withObservationEnvelope,
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

  it('reuses one correlation id across a single emitter flow', async () => {
    const adapter = vi.fn()
    const emitter = createObservationEmitter(
      {
        enabled: true,
        adapter,
        level: 'verbose',
      },
      {
        transport: 'convex',
      },
    )

    await emitter.emit({
      name: 'db.raw.used',
      status: 'success',
    })
    await emitter.child({ transport: 'mcp' }).emit({
      name: 'tool.called',
      status: 'success',
    })

    const [first, second] = adapter.mock.calls.map((call) => call[0])
    expect(first.correlationId).toBe(second.correlationId)
    expect(first.transport).toBe('convex')
    expect(second.transport).toBe('mcp')
  })

  it('preserves originTransport while transport reflects the current boundary', async () => {
    const adapter = vi.fn()
    const emitter = createObservationEmitter(
      {
        enabled: true,
        adapter,
        level: 'verbose',
      },
      {
        transport: 'convex',
        originTransport: 'mcp',
        correlationId: 'corr_origin',
      },
    )

    await emitter.emit({
      name: 'operation.execute.completed',
      status: 'success',
    })

    expect(adapter).toHaveBeenCalledWith(
      expect.objectContaining({
        transport: 'convex',
        originTransport: 'mcp',
        correlationId: 'corr_origin',
      }),
    )
  })

  it('never throws if the adapter fails', async () => {
    const emitter = createObservationEmitter(
      {
        enabled: true,
        adapter: vi.fn(async () => {
          throw new Error('adapter down')
        }),
        level: 'verbose',
      },
      {
        transport: 'convex',
      },
    )

    await expect(
      emitter.emit({
        name: 'db.raw.used',
        status: 'success',
      }),
    ).resolves.toBeUndefined()
  })

  it('never throws if the redactor or generator fails', async () => {
    const emitter = createObservationEmitter(
      {
        enabled: true,
        adapter: vi.fn(),
        level: 'verbose',
        redact: () => {
          throw new Error('bad redact')
        },
        correlation: {
          generate: () => {
            throw new Error('bad generate')
          },
        },
      },
      {
        transport: 'convex',
      },
    )

    await expect(
      emitter.emit({
        name: 'db.cross_tenant.used',
        status: 'success',
      }),
    ).resolves.toBeUndefined()
  })

  it('recursively redacts nested secrets', async () => {
    const adapter = vi.fn()
    const emitter = createObservationEmitter(
      {
        enabled: true,
        adapter,
        level: 'verbose',
      },
      {
        transport: 'convex',
        correlationId: 'corr_nested',
      },
    )

    await emitter.emit({
      name: 'tool.failed',
      status: 'error',
      reasonCode: 'tool.execution_failed',
      details: {
        token: 'root-secret',
        nested: {
          Authorization: 'Bearer abc',
          values: [{ password: 'pw123' }],
        },
      },
    })

    expect(adapter.mock.calls[0]?.[0].details).toEqual({
      token: '[redacted]',
      nested: {
        Authorization: '[redacted]',
        values: [{ password: '[redacted]' }],
      },
    })
  })

  it('rejects invalid sample rates at normalization time', () => {
    expect(() =>
      normalizeObservabilityConfig({
        sample: {
          browser: Number.NaN,
        },
      }),
    ).toThrow('sample.browser')

    expect(() =>
      normalizeObservabilityConfig({
        sample: {
          mcp: 2,
        },
      }),
    ).toThrow('sample.mcp')
  })

  it('adds and strips the internal trellis envelope', () => {
    const args = withObservationEnvelope(
      { id: '123' },
      { correlationId: 'corr_123', originTransport: 'mcp' },
    )
    expect(args).toMatchObject({
      id: '123',
      __trellis: {
        correlationId: 'corr_123',
        originTransport: 'mcp',
      },
    })
    expect(getObservationEnvelope(args)).toEqual({
      correlationId: 'corr_123',
      originTransport: 'mcp',
    })
    expect(stripObservationEnvelope(args)).toEqual({ id: '123' })
  })
})
