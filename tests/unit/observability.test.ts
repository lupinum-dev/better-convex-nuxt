import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createObservationEmitter,
  getObservationEnvelope,
  normalizeObservabilityConfig,
  stripObservationEnvelope,
  withObservationEnvelope,
} from '../../src/runtime/observability'
import { createRuntimeObserver } from '../../src/runtime/observability/runtime-observer'
import { setObservationSinkForTests } from '../../src/runtime/observability/sink'
import { createObservationCapture } from '../../src/runtime/testing'

describe('observability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('normalizes defaults safely', () => {
    const config = normalizeObservabilityConfig({})
    expect(typeof config.enabled).toBe('boolean')
    expect(config.correlation.header).toBe('x-trellis-correlation-id')
    expect(config.service.length).toBeGreaterThan(0)
  })

  it('does not expose evlog delivery from the public observability barrel', async () => {
    const observabilityApi = await import('../../src/runtime/observability')

    expect(observabilityApi).toHaveProperty('createObservationEmitter')
    expect(observabilityApi).toHaveProperty('normalizeObservabilityConfig')
    expect(observabilityApi).not.toHaveProperty('deliverObservationToEvlog')
    expect(observabilityApi).not.toHaveProperty('ObservationSink')
  })

  it('emits redacted semantic events through capture', async () => {
    const capture = createObservationCapture()
    const emitter = createObservationEmitter(
      {
        enabled: true,
        level: 'verbose',
        capture: { backend: true, mcp: true, browser: true },
      },
      {
        transport: 'convex',
        correlationId: 'corr_test',
      },
    )

    await emitter.emit({
      name: 'db.escape_isolation.used',
      status: 'success',
      details: {
        token: 'secret',
        table: 'posts',
        reason: 'seed data',
      },
    })

    expect(capture.events).toHaveLength(1)
    expect(capture.events[0]?.correlationId).toBe('corr_test')
    expect(capture.events[0]?.details).toEqual({
      reason: 'seed data',
      token: '[redacted]',
      table: 'posts',
    })
    capture.stop()
  })

  it('reuses one correlation id across a single emitter flow', async () => {
    const capture = createObservationCapture()
    const emitter = createObservationEmitter(
      {
        enabled: true,
        level: 'verbose',
      },
      {
        transport: 'convex',
      },
    )

    await emitter.emit({
      name: 'db.escape_isolation.used',
      status: 'success',
    })
    await emitter.child({ transport: 'mcp' }).emit({
      name: 'tool.called',
      status: 'success',
    })

    const [first, second] = capture.events
    expect(first?.correlationId).toBe(second?.correlationId)
    expect(first?.transport).toBe('convex')
    expect(second?.transport).toBe('mcp')
    capture.stop()
  })

  it('preserves originTransport while transport reflects the current boundary', async () => {
    const capture = createObservationCapture()
    const emitter = createObservationEmitter(
      {
        enabled: true,
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

    expect(capture.events[0]).toMatchObject({
      transport: 'convex',
      originTransport: 'mcp',
      correlationId: 'corr_origin',
    })
    capture.stop()
  })

  it('delivers already-redacted events to the sink boundary', async () => {
    const delivered: unknown[] = []
    const restore = setObservationSinkForTests({
      emit(event) {
        delivered.push(event)
      },
    })

    try {
      const emitter = createObservationEmitter(
        {
          enabled: true,
          level: 'verbose',
        },
        {
          transport: 'convex',
          correlationId: 'corr_sink',
        },
      )

      await emitter.emit({
        name: 'tool.failed',
        status: 'error',
        reasonCode: 'tool.execution_failed',
        details: {
          token: 'raw-token',
          Authorization: 'Bearer raw',
        },
      })

      expect(delivered).toHaveLength(1)
      expect(delivered[0]).toMatchObject({
        correlationId: 'corr_sink',
        details: {
          token: '[redacted]',
          Authorization: '[redacted]',
        },
      })
      expect(JSON.stringify(delivered)).not.toContain('raw-token')
      expect(JSON.stringify(delivered)).not.toContain('Bearer raw')
    } finally {
      restore()
    }
  })

  it('captures observations even when the delivery sink fails', async () => {
    const capture = createObservationCapture()
    const restore = setObservationSinkForTests({
      emit() {
        throw new Error('sink down')
      },
    })

    try {
      const emitter = createObservationEmitter(
        {
          enabled: true,
          level: 'verbose',
        },
        {
          transport: 'convex',
          correlationId: 'corr_sink_fail',
        },
      )

      await expect(
        emitter.emit({
          name: 'db.escape_isolation.used',
          status: 'success',
        }),
      ).resolves.toBeUndefined()

      expect(capture.events).toHaveLength(1)
      expect(capture.events[0]?.correlationId).toBe('corr_sink_fail')
    } finally {
      restore()
      capture.stop()
    }
  })

  it('bounds slow async sink delivery', async () => {
    vi.useFakeTimers()
    const restore = setObservationSinkForTests({
      emit() {
        return new Promise(() => {})
      },
    })

    try {
      const emitter = createObservationEmitter({
        enabled: true,
        level: 'verbose',
      })
      const emitted = emitter.emit({
        name: 'db.escape_isolation.used',
        status: 'success',
      })

      await vi.advanceTimersByTimeAsync(50)
      await expect(emitted).resolves.toBeUndefined()
    } finally {
      restore()
    }
  })

  it('falls back to a disabled emitter when config normalization fails', async () => {
    expect(() =>
      createObservationEmitter({
        adapter: 'console',
      }),
    ).not.toThrow()

    const emitter = createObservationEmitter({
      adapter: 'console',
    })

    await expect(
      emitter.emit({
        name: 'db.escape_isolation.used',
        status: 'success',
      }),
    ).resolves.toBeUndefined()
  })

  it('keeps runtime summary and debug methods as safe core no-ops', () => {
    const observer = createRuntimeObserver(
      { observability: { enabled: true } },
      { transport: 'nuxt-server', correlationId: 'corr_runtime' },
      { method: 'POST', path: '/api/query' },
    )

    expect(() => observer.setSummary({ handler: 'notes.create' })).not.toThrow()
    expect(() => observer.emitSummary({ status: 'success' })).not.toThrow()
    expect(() => observer.debug('test', { token: 'secret' })).not.toThrow()
    expect(() => observer.time('handler')()).not.toThrow()
  })

  it('recursively redacts nested secrets', async () => {
    const capture = createObservationCapture()
    const emitter = createObservationEmitter(
      {
        enabled: true,
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

    expect(capture.events[0]?.details).toEqual({
      token: '[redacted]',
      nested: {
        Authorization: '[redacted]',
        values: [{ password: '[redacted]' }],
      },
    })
    capture.stop()
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

  it('rejects removed public adapter hooks', () => {
    expect(() =>
      normalizeObservabilityConfig({
        adapter: 'console',
      }),
    ).toThrow('adapter')

    expect(() =>
      normalizeObservabilityConfig({
        redact: () => null,
      }),
    ).toThrow('redact')

    expect(() =>
      normalizeObservabilityConfig({
        correlation: {
          generate: () => 'corr_manual',
        },
      }),
    ).toThrow('correlation.generate')
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
