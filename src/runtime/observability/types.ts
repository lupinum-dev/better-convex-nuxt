export type TrellisObservationTransport =
  | 'browser'
  | 'nuxt-server'
  | 'convex'
  | 'mcp'
  | 'service'
  | 'webhook'

export type TrellisObservationStatus = 'success' | 'deny' | 'error' | 'skip'

export type TrellisObservationFamily =
  | 'identity'
  | 'authorization'
  | 'trust'
  | 'operations'
  | 'mcp'
  | 'browser'

export type TrellisObservationReasonCode =
  | 'guard.auth_required'
  | 'guard.denied'
  | 'authorize.denied'
  | 'rls.denied'
  | 'service.access.denied'
  | 'tool.capability_denied'
  | 'tool.disabled'
  | 'tool.confirmation_mismatch'
  | 'tool.execution_failed'
  | 'query.failed'
  | 'mutation.failed'
  | 'action.failed'
  | 'upload.failed'
  | 'operation.execute.failed'

export type TrellisSuggestedAction =
  | 'sign_in'
  | 'invite_to_workspace'
  | 'grant_capability'
  | 'switch_tenant'
  | 'retry_with_confirmation'
  | 'contact_admin'

export type TrellisDenialDecision =
  | 'guard'
  | 'authorize'
  | 'rls'
  | 'service'
  | 'tool'
  | 'destructive_confirm'

export interface TrellisDenialExplanation {
  reasonCode: TrellisObservationReasonCode
  decision: TrellisDenialDecision
  message: string
  policy?: string
  tenantId?: string
  suggestedAction?: TrellisSuggestedAction
}

export type TrellisObservationDetails = Record<string, unknown> & {
  explanation?: TrellisDenialExplanation
}

type ObservationBase = {
  ts: string
  transport: TrellisObservationTransport
  correlationId: string
  originTransport?: TrellisObservationTransport
  phase?: string
  requestId?: string
  handler?: string
  operation?: string
  tool?: string
  principalKind?: string
  actorKind?: string
  tenantId?: string
  service?: string
  serviceId?: string
  durationMs?: number
  details?: TrellisObservationDetails
}

type ObservationDefinitionMap = {
  'principal.resolved': { status: 'success'; reasonCode?: never }
  'actor.resolved': { status: 'success'; reasonCode?: never }
  'actor.missing': { status: 'skip'; reasonCode?: never }
  'guard.allowed': { status: 'success'; reasonCode?: never }
  'guard.denied': { status: 'deny'; reasonCode: 'guard.auth_required' | 'guard.denied' }
  'authorize.allowed': { status: 'success'; reasonCode?: never }
  'authorize.denied': { status: 'deny'; reasonCode: 'authorize.denied' }
  'rls.denied': { status: 'deny'; reasonCode: 'rls.denied' | 'service.access.denied' }
  'unsafe.handler.used': { status: 'success'; reasonCode?: never }
  'db.escape_tenant_isolation.used': { status: 'success'; reasonCode?: never }
  'service.access.checked': { status: 'success'; reasonCode?: never }
  'service.access.denied': { status: 'deny'; reasonCode: 'service.access.denied' }
  'operation.preview.started': { status: 'success'; reasonCode?: never }
  'operation.preview.completed': { status: 'success'; reasonCode?: never }
  'operation.confirm.validated': { status: 'success'; reasonCode?: never }
  'operation.confirm.drifted': { status: 'deny'; reasonCode: 'tool.confirmation_mismatch' }
  'operation.execute.completed': { status: 'success'; reasonCode?: never }
  'operation.execute.failed': { status: 'error'; reasonCode?: 'operation.execute.failed' }
  'tool.called': { status: 'success'; reasonCode?: never }
  'tool.denied': {
    status: 'deny'
    reasonCode: 'tool.capability_denied' | 'tool.disabled' | 'tool.confirmation_mismatch'
  }
  'tool.confirmation.required': { status: 'success'; reasonCode?: never }
  'tool.executed': { status: 'success'; reasonCode?: never }
  'tool.failed': { status: 'error'; reasonCode: 'tool.execution_failed' }
  'auth.session.checked': { status: 'success' | 'skip' | 'error'; reasonCode?: never }
  'query.subscribed': { status: 'success'; reasonCode?: never }
  'query.updated': { status: 'success'; reasonCode?: never }
  'query.unsubscribed': { status: 'success' | 'skip'; reasonCode?: never }
  'query.failed': { status: 'error'; reasonCode: 'query.failed' }
  'mutation.completed': { status: 'success'; reasonCode?: never }
  'mutation.failed': { status: 'error'; reasonCode: 'mutation.failed' }
  'action.completed': { status: 'success'; reasonCode?: never }
  'action.failed': { status: 'error'; reasonCode: 'action.failed' }
  'upload.completed': { status: 'success'; reasonCode?: never }
  'upload.failed': { status: 'error'; reasonCode: 'upload.failed' }
  'connection.lost': { status: 'success'; reasonCode?: never }
  'connection.restored': { status: 'success'; reasonCode?: never }
}

export type TrellisObservationName = keyof ObservationDefinitionMap

export type TrellisObservationEvent = {
  [K in TrellisObservationName]: ObservationBase & { name: K } & ObservationDefinitionMap[K]
}[TrellisObservationName]

export type TrellisObservationRedactor = (event: TrellisObservationEvent) => TrellisObservationEvent

export interface TrellisObservabilityOptions {
  enabled?: boolean
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
  service?: string
  explainability?: {
    agentDenials?: boolean
  }
}

export interface NormalizedTrellisObservabilityConfig {
  enabled: boolean
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
  service: string
  explainability: {
    agentDenials: boolean
  }
}

export type TrellisObservationContext = {
  transport?: TrellisObservationTransport
  originTransport?: TrellisObservationTransport
  correlationId?: string
  requestId?: string
  handler?: string
  operation?: string
  tool?: string
  principalKind?: string
  actorKind?: string
  tenantId?: string
  service?: string
  serviceId?: string
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

export type PartialObservationEvent = DistributiveOmit<
  TrellisObservationEvent,
  'ts' | 'correlationId' | 'transport'
> &
  Partial<Pick<TrellisObservationEvent, 'correlationId' | 'transport' | 'originTransport'>>

export type ObservationEventInput = Omit<
  TrellisObservationEvent,
  'ts' | 'correlationId' | 'transport'
> &
  Partial<Pick<TrellisObservationEvent, 'correlationId' | 'transport' | 'originTransport'>>

export const alwaysOnEvents: ReadonlySet<TrellisObservationName> = new Set<TrellisObservationName>([
  'guard.denied',
  'authorize.denied',
  'rls.denied',
  'unsafe.handler.used',
  'db.escape_tenant_isolation.used',
  'service.access.denied',
  'operation.confirm.drifted',
  'operation.execute.failed',
  'tool.denied',
  'tool.failed',
])

export const criticalEvents: ReadonlySet<TrellisObservationName> = new Set<TrellisObservationName>([
  ...alwaysOnEvents,
  'tool.confirmation.required',
  'tool.executed',
  'operation.execute.completed',
])

export const nonVerboseEvents: ReadonlySet<TrellisObservationName> =
  new Set<TrellisObservationName>([
    'principal.resolved',
    'actor.resolved',
    'actor.missing',
    'guard.allowed',
    'guard.denied',
    'authorize.allowed',
    'authorize.denied',
    'rls.denied',
    'unsafe.handler.used',
    'db.escape_tenant_isolation.used',
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
    'query.subscribed',
    'query.updated',
    'query.unsubscribed',
    'query.failed',
    'mutation.completed',
    'mutation.failed',
    'action.completed',
    'action.failed',
    'upload.completed',
    'upload.failed',
    'connection.lost',
    'connection.restored',
  ])

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
