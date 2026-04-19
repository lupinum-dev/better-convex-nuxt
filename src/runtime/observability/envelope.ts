import { v, type Infer, type PropertyValidators } from 'convex/values'

import type { TrellisObservationContext, TrellisObservationTransport } from './types.js'

export const trellisEnvelopeKey = '__trellis' as const

const transportLiterals = [
  v.literal('browser'),
  v.literal('nuxt-server'),
  v.literal('convex'),
  v.literal('mcp'),
  v.literal('service'),
  v.literal('webhook'),
] as const

export const trellisTransportValidator = v.union(...transportLiterals)

export const trellisEnvelopeValidator = v.object({
  correlationId: v.string(),
  originTransport: trellisTransportValidator,
  requestId: v.optional(v.string()),
})

export type TrellisObservationEnvelope = Infer<typeof trellisEnvelopeValidator>
export type EventObservationState = Partial<
  Pick<TrellisObservationEnvelope, 'correlationId' | 'originTransport' | 'requestId'>
>

function isTransport(value: unknown): value is TrellisObservationTransport {
  return (
    value === 'browser' ||
    value === 'nuxt-server' ||
    value === 'convex' ||
    value === 'mcp' ||
    value === 'service' ||
    value === 'webhook'
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function getEventObservationState(
  eventContext: Record<string, unknown>,
): EventObservationState {
  const raw = eventContext[trellisEnvelopeKey]
  if (!isRecord(raw)) return {}

  return {
    ...(typeof raw.correlationId === 'string' ? { correlationId: raw.correlationId } : {}),
    ...(typeof raw.requestId === 'string' ? { requestId: raw.requestId } : {}),
    ...(isTransport(raw.originTransport) ? { originTransport: raw.originTransport } : {}),
  }
}

export function sanitizeCorrelationId(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') return undefined
  const sanitized = value
    .replace(/[^\x20-\x7E]+/g, '')
    .trim()
    .slice(0, 256)
  return sanitized.length > 0 ? sanitized : undefined
}

export function buildObservationEnvelopeValidators(): PropertyValidators {
  return {
    [trellisEnvelopeKey]: v.optional(trellisEnvelopeValidator),
  }
}

export function withObservationEnvelope<TArgs extends Record<string, unknown> | undefined>(
  args: TArgs,
  envelope: TrellisObservationEnvelope,
): TArgs {
  return {
    ...(args ?? {}),
    [trellisEnvelopeKey]: envelope,
  } as unknown as TArgs
}

export function getObservationEnvelope(
  args: Record<string, unknown>,
): TrellisObservationEnvelope | null {
  const value = args[trellisEnvelopeKey]
  if (!isRecord(value)) return null
  if (typeof value.correlationId !== 'string' || !isTransport(value.originTransport)) {
    return null
  }
  if (value.requestId !== undefined && typeof value.requestId !== 'string') {
    return null
  }
  return {
    correlationId: value.correlationId,
    originTransport: value.originTransport,
    ...(typeof value.requestId === 'string' ? { requestId: value.requestId } : {}),
  }
}

export function stripObservationEnvelope(args: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(args).filter(([key]) => key !== trellisEnvelopeKey))
}

export function toObservationContext(
  envelope: TrellisObservationEnvelope | null,
): Pick<TrellisObservationContext, 'correlationId' | 'originTransport' | 'requestId'> {
  if (!envelope) return {}
  return {
    correlationId: envelope.correlationId,
    originTransport: envelope.originTransport,
    requestId: envelope.requestId,
  }
}
