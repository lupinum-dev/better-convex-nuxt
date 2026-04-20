import * as evlog from 'evlog'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import {
  createObservationEmitter,
  createWideSummary,
  getObservationEnvelope,
  normalizeObservabilityConfig,
  stripObservationEnvelope,
  withObservationEnvelope,
} from '../../src/runtime/observability'
import { createRuntimeObserver } from '../../src/runtime/observability/runtime-observer'
import { createObservationCapture } from '../../src/runtime/testing'

const evlogMock = vi.hoisted(() => ({
  initLogger: vi.fn(),
  createLogger: vi.fn(),
  createRequestLogger: vi.fn(),
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

function createWideLoggerMock(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    set: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    emit: vi.fn(),
    getContext: vi.fn(() => ({})),
    ...overrides,
  }
}

vi.mock('evlog', () => {
  return {
    initLogger: evlogMock.initLogger,
    createLogger: evlogMock.createLogger,
    createRequestLogger: evlogMock.createRequestLogger,
    log: evlogMock.log,
    __evlogMock: evlogMock,
  }
})

describe('observability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    evlogMock.initLogger.mockImplementation(() => undefined)
    evlogMock.createLogger.mockImplementation(() => createWideLoggerMock())
    evlogMock.createRequestLogger.mockImplementation(() => createWideLoggerMock())
  })

  it('normalizes defaults safely', () => {
    const config = normalizeObservabilityConfig({})
    expect(typeof config.enabled).toBe('boolean')
    expect(config.correlation.header).toBe('x-trellis-correlation-id')
    expect(config.service.length).toBeGreaterThan(0)
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
      name: 'db.escape_tenant_isolation.used',
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
      name: 'db.escape_tenant_isolation.used',
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

  it('never throws if evlog delivery fails', async () => {
    ;(
      evlog as unknown as { __evlogMock: typeof evlogMock }
    ).__evlogMock.log.info.mockImplementation(() => {
      throw new Error('evlog down')
    })

    const emitter = createObservationEmitter(
      {
        enabled: true,
        level: 'verbose',
      },
      {
        transport: 'convex',
      },
    )

    await expect(
      emitter.emit({
        name: 'db.escape_tenant_isolation.used',
        status: 'success',
      }),
    ).resolves.toBeUndefined()
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
        name: 'db.escape_tenant_isolation.used',
        status: 'success',
      }),
    ).resolves.toBeUndefined()
  })

  it('never throws if evlog wide logger creation or methods fail', () => {
    const config = normalizeObservabilityConfig({})

    evlogMock.createRequestLogger.mockImplementationOnce(() => {
      throw new Error('factory failed')
    })

    expect(() =>
      createWideSummary({
        config,
        method: 'POST',
        path: '/api/test',
      }),
    ).not.toThrow()

    evlogMock.createLogger.mockImplementationOnce(() =>
      createWideLoggerMock({
        set: vi.fn(() => {
          throw new Error('set failed')
        }),
        emit: vi.fn(() => {
          throw new Error('emit failed')
        }),
      }),
    )

    const summary = createWideSummary({
      config,
      initialContext: { correlationId: 'corr_test' },
    })

    expect(() => summary.set({ handler: 'notes.create' })).not.toThrow()
    expect(() => summary.emit({ status: 'success' })).not.toThrow()
  })

  it('never throws if runtime observer setup fails', () => {
    evlogMock.createRequestLogger.mockImplementationOnce(() => {
      throw new Error('request logger failed')
    })

    expect(() =>
      createRuntimeObserver(
        { observability: { enabled: true } },
        { transport: 'nuxt-server', correlationId: 'corr_runtime' },
        { method: 'POST', path: '/api/query' },
      ),
    ).not.toThrow()
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
