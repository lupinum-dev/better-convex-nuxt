import { createConsola } from 'consola'

export type TrellisObservationTransport =
  | 'browser'
  | 'nuxt-server'
  | 'convex'
  | 'mcp'
  | 'service'
  | 'webhook'

export type TrellisObservationStatus = 'success' | 'deny' | 'error' | 'skip'

export type TrellisObservationName =
  | 'principal.resolved'
  | 'actor.resolved'
  | 'actor.missing'
  | 'guard.allowed'
  | 'guard.denied'
  | 'authorize.allowed'
  | 'authorize.denied'
  | 'rls.denied'
  | 'db.cross_tenant.used'
  | 'db.raw.used'
  | 'service.access.checked'
  | 'service.access.denied'
  | 'operation.preview.started'
  | 'operation.preview.completed'
  | 'operation.confirm.validated'
  | 'operation.confirm.drifted'
  | 'operation.execute.completed'
  | 'operation.execute.failed'
  | 'tool.called'
  | 'tool.denied'
  | 'tool.confirmation.required'
  | 'tool.executed'
  | 'tool.failed'
  | 'auth.session.checked'
  | 'query.subscribed'
  | 'query.updated'
  | 'query.unsubscribed'
  | 'mutation.completed'
  | 'mutation.failed'
  | 'action.completed'
  | 'action.failed'
  | 'upload.completed'
  | 'upload.failed'
  | 'connection.lost'
  | 'connection.restored'

export type TrellisObservationFamily =
  | 'identity'
  | 'authorization'
  | 'trust'
  | 'operations'
  | 'mcp'
  | 'browser'

export interface TrellisObservationEvent {
  ts: string
  transport: TrellisObservationTransport
  name: TrellisObservationName
  status: TrellisObservationStatus
  correlationId: string
  phase?: string
  requestId?: string
  handler?: string
  operation?: string
  tool?: string
  principalKind?: string
  actorKind?: string
  tenantId?: string
  serviceId?: string
  reasonCode?: string
  durationMs?: number
  details?: Record<string, unknown>
}

export type TrellisObservationAdapter = (
  event: TrellisObservationEvent,
) => void | Promise<void>

export type TrellisObservationRedactor = (
  event: TrellisObservationEvent,
) => TrellisObservationEvent

export interface TrellisObservabilityOptions {
  enabled?: boolean
  adapter?: TrellisObservationAdapter | 'dev'
  capture?: {
    backend?: boolean
    mcp?: boolean
    browser?: boolean
  }
  level?: 'critical' | 'normal' | 'verbose'
  sample?: Partial<Record<TrellisObservationFamily, number>>
  redact?: TrellisObservationRedactor
  correlation?: {
    header?: string
    generate?: () => string
  }
}

export interface TrellisObservabilityModuleOptions {
  enabled?: boolean
  adapter?: 'dev'
  capture?: {
    backend?: boolean
    mcp?: boolean
    browser?: boolean
  }
  level?: 'critical' | 'normal' | 'verbose'
  sample?: Partial<Record<TrellisObservationFamily, number>>
  correlation?: {
    header?: string
  }
}

export interface NormalizedTrellisObservabilityConfig {
  enabled: boolean
  adapter: TrellisObservationAdapter | 'dev' | null
  capture: {
    backend: boolean
    mcp: boolean
    browser: boolean
  }
  level: 'critical' | 'normal' | 'verbose'
  sample: Partial<Record<TrellisObservationFamily, number>>
  redact: TrellisObservationRedactor
  correlation: {
    header: string
    generate: () => string
  }
}

export type TrellisObservationInput = {
  logging?: unknown
  observability?: unknown
}

export type TrellisObservationContext = {
  transport?: TrellisObservationTransport
  correlationId?: string
  requestId?: string
  handler?: string
  operation?: string
  tool?: string
  principalKind?: string
  actorKind?: string
  tenantId?: string
  serviceId?: string
}

type PartialObservationEvent = Omit<TrellisObservationEvent, 'ts' | 'correlationId' | 'transport'> &
  Partial<Pick<TrellisObservationEvent, 'correlationId' | 'transport'>>

const alwaysOnEvents = new Set<TrellisObservationName>([
  'guard.denied',
  'authorize.denied',
  'rls.denied',
  'db.cross_tenant.used',
  'db.raw.used',
  'service.access.denied',
  'operation.confirm.drifted',
  'operation.execute.failed',
  'operation.execute.completed',
  'tool.denied',
  'tool.failed',
  'tool.confirmation.required',
  'tool.executed',
])

const criticalEvents = new Set<TrellisObservationName>([
  'guard.denied',
  'authorize.denied',
  'rls.denied',
  'db.cross_tenant.used',
  'db.raw.used',
  'service.access.denied',
  'operation.confirm.drifted',
  'operation.execute.completed',
  'operation.execute.failed',
  'tool.denied',
  'tool.confirmation.required',
  'tool.executed',
  'tool.failed',
])

const nonVerboseEvents = new Set<TrellisObservationName>([
  'principal.resolved',
  'actor.resolved',
  'actor.missing',
  'guard.allowed',
  'guard.denied',
  'authorize.allowed',
  'authorize.denied',
  'rls.denied',
  'db.cross_tenant.used',
  'db.raw.used',
  'service.access.checked',
  'service.access.denied',
  'operation.preview.started',
  'operation.preview.completed',
  'operation.confirm.validated',
  'operation.confirm.drifted',
  'operation.execute.completed',
  'operation.execute.failed',
  'tool.called',
  'tool.denied',
  'tool.confirmation.required',
  'tool.executed',
  'tool.failed',
  'auth.session.checked',
  'mutation.completed',
  'mutation.failed',
  'action.completed',
  'action.failed',
  'upload.completed',
  'upload.failed',
  'connection.lost',
  'connection.restored',
])

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

function defaultRedactor(event: TrellisObservationEvent): TrellisObservationEvent {
  if (!event.details) return event
  const redacted: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(event.details)) {
    const lower = key.toLowerCase()
    if (
      lower.includes('token') ||
      lower.includes('secret') ||
      lower.includes('cookie') ||
      lower.includes('password')
    ) {
      redacted[key] = '[redacted]'
      continue
    }
    redacted[key] = value
  }
  return { ...event, details: redacted }
}

export function getObservationFamily(name: TrellisObservationName): TrellisObservationFamily {
  if (name.startsWith('principal.') || name.startsWith('actor.')) return 'identity'
  if (name.startsWith('guard.') || name.startsWith('authorize.') || name === 'rls.denied') {
    return 'authorization'
  }
  if (name.startsWith('db.') || name.startsWith('service.')) return 'trust'
  if (name.startsWith('operation.')) return 'operations'
  if (name.startsWith('tool.')) return 'mcp'
  return 'browser'
}

export function normalizeObservabilityConfig(
  input: unknown,
): NormalizedTrellisObservabilityConfig {
  const raw = isRecord(input) ? input : {}
  const capture = isRecord(raw.capture) ? raw.capture : {}
  const correlation = isRecord(raw.correlation) ? raw.correlation : {}
  const env = process.env.NODE_ENV
  const isDev = env === 'development'
  const isTest = env === 'test'
  const enabled = typeof raw.enabled === 'boolean' ? raw.enabled : isDev
  const adapter = (() => {
    if (raw.adapter === 'dev') return 'dev' as const
    if (typeof raw.adapter === 'function') return raw.adapter as TrellisObservationAdapter
    return enabled && isDev && !isTest ? ('dev' as const) : null
  })()

  return {
    enabled,
    adapter,
    capture: {
      backend: typeof capture.backend === 'boolean' ? capture.backend : enabled,
      mcp: typeof capture.mcp === 'boolean' ? capture.mcp : enabled,
      browser: typeof capture.browser === 'boolean' ? capture.browser : enabled && isDev,
    },
    level:
      raw.level === 'critical' || raw.level === 'normal' || raw.level === 'verbose'
        ? raw.level
        : isDev
          ? 'verbose'
          : 'critical',
    sample: isRecord(raw.sample)
      ? (raw.sample as Partial<Record<TrellisObservationFamily, number>>)
      : {},
    redact:
      typeof raw.redact === 'function'
        ? (raw.redact as TrellisObservationRedactor)
        : defaultRedactor,
    correlation: {
      header:
        typeof correlation.header === 'string' && correlation.header.trim().length > 0
          ? correlation.header
          : 'x-trellis-correlation-id',
      generate:
        typeof correlation.generate === 'function'
          ? (correlation.generate as () => string)
          : defaultGenerateCorrelationId,
    },
  }
}

function captureEnabledForTransport(
  config: NormalizedTrellisObservabilityConfig,
  transport: TrellisObservationTransport,
): boolean {
  if (transport === 'browser') return config.capture.browser
  if (transport === 'mcp') return config.capture.mcp
  return config.capture.backend
}

function shouldSampleEvent(
  config: NormalizedTrellisObservabilityConfig,
  name: TrellisObservationName,
): boolean {
  if (alwaysOnEvents.has(name)) return true
  const family = getObservationFamily(name)
  const rate = config.sample[family]
  if (typeof rate !== 'number') return true
  if (rate <= 0) return false
  if (rate >= 1) return true
  return Math.random() < rate
}

function levelAllowsEvent(
  config: NormalizedTrellisObservabilityConfig,
  name: TrellisObservationName,
): boolean {
  if (config.level === 'verbose') return true
  if (config.level === 'normal') return nonVerboseEvents.has(name)
  return criticalEvents.has(name)
}

function formatObservationSummary(event: TrellisObservationEvent): string {
  const parts = [
    event.name,
    event.handler ? `handler=${event.handler}` : null,
    event.operation ? `operation=${event.operation}` : null,
    event.tool ? `tool=${event.tool}` : null,
    event.reasonCode ? `reason=${event.reasonCode}` : null,
    event.principalKind ? `principal=${event.principalKind}` : null,
    event.actorKind ? `actor=${event.actorKind}` : null,
    event.tenantId ? `tenant=${event.tenantId}` : null,
    event.serviceId ? `service=${event.serviceId}` : null,
    typeof event.durationMs === 'number' ? `duration=${event.durationMs}ms` : null,
  ].filter(Boolean)

  return parts.join(' ')
}

function createDevAdapter(): TrellisObservationAdapter {
  const consola = createConsola({ level: 4 }).withTag('trellis').withTag('observe')

  return (event) => {
    const summary = formatObservationSummary(event)
    if (event.status === 'error') {
      consola.error(summary, event.details ?? {})
      return
    }
    if (event.status === 'deny') {
      consola.warn(summary, event.details ?? {})
      return
    }
    consola.info(summary, event.details ?? {})
  }
}

export function createObservationEmitter(
  input: unknown,
  baseContext: TrellisObservationContext = {},
): {
  config: NormalizedTrellisObservabilityConfig
  emit: (event: PartialObservationEvent) => Promise<void>
  child: (next: TrellisObservationContext) => ReturnType<typeof createObservationEmitter>
} {
  const config = normalizeObservabilityConfig(input)
  const devAdapter = config.adapter === 'dev' ? createDevAdapter() : null
  const adapter = typeof config.adapter === 'function' ? config.adapter : devAdapter

  const emit = async (event: PartialObservationEvent) => {
    const transport = event.transport ?? baseContext.transport ?? 'browser'
    if (!config.enabled || !adapter || !captureEnabledForTransport(config, transport)) {
      return
    }
    if (!levelAllowsEvent(config, event.name)) return
    if (!shouldSampleEvent(config, event.name)) return

    const payload = config.redact({
      ts: new Date().toISOString(),
      transport,
      name: event.name,
      status: event.status,
      correlationId:
        event.correlationId ??
        baseContext.correlationId ??
        config.correlation.generate(),
      phase: event.phase,
      requestId: event.requestId ?? baseContext.requestId,
      handler: event.handler ?? baseContext.handler,
      operation: event.operation ?? baseContext.operation,
      tool: event.tool ?? baseContext.tool,
      principalKind: event.principalKind ?? baseContext.principalKind,
      actorKind: event.actorKind ?? baseContext.actorKind,
      tenantId: event.tenantId ?? baseContext.tenantId,
      serviceId: event.serviceId ?? baseContext.serviceId,
      reasonCode: event.reasonCode,
      durationMs: event.durationMs,
      details: event.details,
    })

    await adapter(payload)
  }

  return {
    config,
    emit,
    child: (next) =>
      createObservationEmitter(input, {
        ...baseContext,
        ...next,
      }),
  }
}

export const observationArgKeys = {
  correlationId: '_trellisCorrelationId',
  transport: '_trellisTransport',
  requestId: '_trellisRequestId',
} as const

export type TrellisObservationArgEnvelope = {
  _trellisCorrelationId?: string
  _trellisTransport?: TrellisObservationTransport
  _trellisRequestId?: string
}

export function withObservationArgs<TArgs extends Record<string, unknown> | undefined>(
  args: TArgs,
  envelope: {
    correlationId?: string
    transport?: TrellisObservationTransport
    requestId?: string
  },
): TArgs {
  return {
    ...(args ?? {}),
    ...(envelope.correlationId
      ? { [observationArgKeys.correlationId]: envelope.correlationId }
      : {}),
    ...(envelope.transport ? { [observationArgKeys.transport]: envelope.transport } : {}),
    ...(envelope.requestId ? { [observationArgKeys.requestId]: envelope.requestId } : {}),
  } as TArgs
}

export function getObservationArgs(args: Record<string, unknown>): TrellisObservationArgEnvelope {
  return {
    _trellisCorrelationId:
      typeof args[observationArgKeys.correlationId] === 'string'
        ? (args[observationArgKeys.correlationId] as string)
        : undefined,
    _trellisTransport:
      typeof args[observationArgKeys.transport] === 'string'
        ? (args[observationArgKeys.transport] as TrellisObservationTransport)
        : undefined,
    _trellisRequestId:
      typeof args[observationArgKeys.requestId] === 'string'
        ? (args[observationArgKeys.requestId] as string)
        : undefined,
  }
}

export function stripObservationArgs(args: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(args).filter(
      ([key]) =>
        key !== observationArgKeys.correlationId &&
        key !== observationArgKeys.transport &&
        key !== observationArgKeys.requestId,
    ),
  )
}
