import type {
  NormalizedTrellisObservabilityConfig,
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

function defaultRedactor<TEvent extends { details?: Record<string, unknown> }>(
  event: TEvent,
): TEvent {
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
  source?: 'module' | 'runtime'
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
  const source = options.source ?? 'runtime'

  if ('adapter' in raw) {
    throwConfigError(
      'adapter',
      'is no longer supported; Trellis owns observability semantics and delivers through an internal sink',
    )
  }
  if ('redact' in raw) {
    throwConfigError('redact', 'is no longer configurable; Trellis owns redaction internally')
  }
  if (isRecord(raw.correlation) && 'generate' in raw.correlation) {
    throwConfigError(
      'correlation.generate',
      'is no longer supported; Trellis owns correlation generation internally',
    )
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
  if (typeof raw.service !== 'undefined' && typeof raw.service !== 'string') {
    throwConfigError('service', 'must be a string')
  }
  if (typeof raw.explainability !== 'undefined' && !isRecord(raw.explainability)) {
    throwConfigError('explainability', 'must be an object')
  }
  if (
    isRecord(raw.explainability) &&
    typeof raw.explainability.agentDenials !== 'undefined' &&
    typeof raw.explainability.agentDenials !== 'boolean'
  ) {
    throwConfigError('explainability.agentDenials', 'must be a boolean')
  }
  if (source === 'module') {
    // Module config is serialized into runtime config. Fail loudly on function-valued fields here.
    for (const [path, value] of [
      ['enabled', raw.enabled],
      ['level', raw.level],
      ['service', raw.service],
      ['correlation.header', correlation.header],
    ] as const) {
      if (typeof value === 'function') {
        throwConfigError(path, 'function values are not supported in nuxt.config.ts')
      }
    }
  }

  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : true,
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
    redact: defaultRedactor as TrellisObservationRedactor,
    correlation: {
      header:
        typeof correlation.header === 'string' && correlation.header.trim().length > 0
          ? correlation.header
          : 'x-trellis-correlation-id',
      generate: defaultGenerateCorrelationId,
    },
    service:
      typeof raw.service === 'string' && raw.service.trim().length > 0
        ? raw.service.trim()
        : process.env.npm_package_name?.trim() || 'app',
    explainability: {
      agentDenials:
        isRecord(raw.explainability) && typeof raw.explainability.agentDenials === 'boolean'
          ? raw.explainability.agentDenials
          : true,
    },
  }
}
