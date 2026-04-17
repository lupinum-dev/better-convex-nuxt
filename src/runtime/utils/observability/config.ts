import type {
  NormalizedTrellisObservabilityConfig,
  TrellisObservationAdapter,
  TrellisObservationFamily,
  TrellisObservationRedactor,
} from './types.js'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function defaultGenerateCorrelationId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `corr_${Math.random().toString(36).slice(2, 12)}`
  }
}

function redactValue(value: unknown, keyHint?: string): unknown {
  const key = keyHint?.toLowerCase() ?? ''
  const shouldRedact =
    key.includes('token') ||
    key.includes('authorization') ||
    key.includes('secret') ||
    key.includes('password') ||
    key.includes('cookie') ||
    key.includes('apikey') ||
    key.includes('api_key') ||
    key.includes('bearer')

  if (shouldRedact) return '[redacted]'
  if (Array.isArray(value)) return value.map((entry) => redactValue(entry))
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([nestedKey, nestedValue]) => [
        nestedKey,
        redactValue(nestedValue, nestedKey),
      ]),
    )
  }
  return value
}

function defaultRedactor<TEvent extends { details?: Record<string, unknown> }>(event: TEvent): TEvent {
  if (!event.details) return event
  return {
    ...event,
    details: redactValue(event.details) as Record<string, unknown>,
  }
}

function throwConfigError(path: string, message: string): never {
  throw new Error(`[trellis.observability] ${path}: ${message}`)
}

type NormalizeOptions = {
  allowCustomAdapters?: boolean
  allowFunctionHooks?: boolean
}

export function normalizeObservabilityConfig(
  input: unknown,
  options: NormalizeOptions = {},
): NormalizedTrellisObservabilityConfig {
  const raw = isRecord(input) ? input : {}
  const capture = isRecord(raw.capture) ? raw.capture : {}
  const correlation = isRecord(raw.correlation) ? raw.correlation : {}
  const sample = isRecord(raw.sample) ? raw.sample : {}
  const env = process.env.NODE_ENV
  const isDev = env !== 'production'
  const allowCustomAdapters = options.allowCustomAdapters === true
  const allowFunctionHooks = options.allowFunctionHooks === true

  if (typeof raw.adapter === 'function' && !allowCustomAdapters) {
    throwConfigError('adapter', 'custom adapter functions are not supported in this context')
  }
  if (typeof raw.redact === 'function' && !allowFunctionHooks) {
    throwConfigError('redact', 'function hooks are not supported in this context')
  }
  if (typeof correlation.generate === 'function' && !allowFunctionHooks) {
    throwConfigError('correlation.generate', 'function hooks are not supported in this context')
  }

  const normalizedSample: Partial<Record<TrellisObservationFamily, number>> = {}
  for (const [key, value] of Object.entries(sample)) {
    if (
      key !== 'identity' &&
      key !== 'authorization' &&
      key !== 'trust' &&
      key !== 'operations' &&
      key !== 'mcp' &&
      key !== 'browser'
    ) {
      throwConfigError(`sample.${key}`, 'unsupported sample family')
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
      throwConfigError(`sample.${key}`, 'sample rate must be a finite number between 0 and 1')
    }
    normalizedSample[key] = value
  }

  const adapter = (() => {
    if (raw.adapter === 'console' || raw.adapter === undefined || raw.adapter === null) {
      return 'console' as const
    }
    if (typeof raw.adapter === 'function') {
      return raw.adapter as TrellisObservationAdapter
    }
    throwConfigError('adapter', "supported values are 'console' or a function adapter")
  })()

  const redact = (() => {
    if (raw.redact === undefined || raw.redact === null) {
      return defaultRedactor as TrellisObservationRedactor
    }
    if (typeof raw.redact === 'function') {
      return raw.redact as TrellisObservationRedactor
    }
    throwConfigError('redact', 'must be a function')
  })()

  const generate = (() => {
    if (correlation.generate === undefined || correlation.generate === null) {
      return defaultGenerateCorrelationId
    }
    if (typeof correlation.generate === 'function') {
      return correlation.generate as () => string
    }
    throwConfigError('correlation.generate', 'must be a function')
  })()

  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : true,
    adapter,
    capture: {
      backend: typeof capture.backend === 'boolean' ? capture.backend : true,
      mcp: typeof capture.mcp === 'boolean' ? capture.mcp : true,
      browser: typeof capture.browser === 'boolean' ? capture.browser : isDev,
    },
    level:
      raw.level === 'critical' || raw.level === 'normal' || raw.level === 'verbose'
        ? raw.level
        : isDev
          ? 'verbose'
          : 'critical',
    sample: normalizedSample,
    redact,
    correlation: {
      header:
        typeof correlation.header === 'string' && correlation.header.trim().length > 0
          ? correlation.header
          : 'x-trellis-correlation-id',
      generate,
    },
  }
}
