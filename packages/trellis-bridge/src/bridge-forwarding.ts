import {
  createTrustedForwardingEnvelope,
  extractSubject,
  getTrustedForwardingKeyProductionIssue,
} from '@lupinum/trellis/backend'
import type { FunctionReference } from 'convex/server'

declare const process:
  | {
      env?: Record<string, string | undefined>
    }
  | undefined

declare const crypto:
  | {
      randomUUID?: () => string
    }
  | undefined

type ComponentBridgeFunctionRef = FunctionReference<
  'query' | 'mutation' | 'action',
  'public' | 'internal'
>

const functionNameSymbol = Symbol.for('functionName')
const bridgeForwardingIssuer = 'trellis://server'
const bridgeForwardingAudience = 'trellis://convex'
const bridgeForwardingKeyId = 'default'
const bridgeForwardingTtlsMs = {
  query: 60_000,
  mutation: 30_000,
  action: 30_000,
} satisfies Record<'query' | 'mutation' | 'action', number>

function resolveBridgePrincipalSubject(principal: unknown): string {
  if (
    typeof principal === 'object' &&
    principal !== null &&
    'kind' in principal &&
    (principal as { kind?: unknown }).kind === 'anonymous'
  ) {
    throw new Error('createComponentBridge() cannot forward an anonymous principal.')
  }

  const subject = extractSubject(principal)
  if (!subject) {
    throw new Error(
      'createComponentBridge() requires the resolved principal to include a canonical subject.',
    )
  }

  return subject
}

export function getRequiredBridgeTrustedForwardingKey(override?: string): string {
  const trustedForwardingKey =
    override?.trim() ||
    (typeof process !== 'undefined' ? process.env?.CONVEX_TRUSTED_FORWARDING_KEY?.trim() : '')
  if (!trustedForwardingKey) {
    throw new Error('createComponentBridge() requires CONVEX_TRUSTED_FORWARDING_KEY to be set.')
  }
  const trustedForwardingKeyIssue = getTrustedForwardingKeyProductionIssue(trustedForwardingKey)
  if (trustedForwardingKeyIssue) {
    throw new Error(trustedForwardingKeyIssue)
  }

  return trustedForwardingKey
}

function getBridgeFunctionRef(
  ref: ComponentBridgeFunctionRef,
  explicitFunctionRef?: string,
): string {
  if (explicitFunctionRef?.trim()) return explicitFunctionRef.trim()

  try {
    const value = ref as unknown
    if (typeof value === 'string') return value
    if (typeof value === 'object' && value !== null) {
      const record = value as Record<string | symbol, unknown>
      const symbolName = record[functionNameSymbol]
      if (typeof symbolName === 'string') return symbolName
      if (typeof record._path === 'string') return record._path
      if (typeof record.functionPath === 'string') return record.functionPath
    }
  } catch {
    // Fall through to the fail-closed error below.
  }

  throw new Error('createComponentBridge() requires an exact component function ref.')
}

function createBridgeJti(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `bridge-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export interface CreateBridgeForwardingEnvelopeOptions {
  trustedForwardingKey: string
  principal: unknown
  operation: 'query' | 'mutation' | 'action'
  functionRef: string
  args: Record<string, unknown>
  jtiPrefix?: string
}

/**
 * Sign a trusted-forwarding envelope using the bridge-standard issuer,
 * audience, key id, and TTLs. Bridge consumers (e.g. CLI tools that call
 * the Convex component with a deploy-key principal) should use this
 * instead of constructing envelopes themselves so the signing parameters
 * stay single-sourced.
 */
export function createBridgeForwardingEnvelope(
  options: CreateBridgeForwardingEnvelopeOptions,
): string {
  const subject = resolveBridgePrincipalSubject(options.principal)
  const jti = options.jtiPrefix ? `${options.jtiPrefix}-${createBridgeJti()}` : createBridgeJti()
  return createTrustedForwardingEnvelope({
    key: options.trustedForwardingKey,
    keyId:
      (typeof process !== 'undefined' ? process.env?.CONVEX_TRUSTED_FORWARDING_KEY_ID : '') ||
      bridgeForwardingKeyId,
    iss: bridgeForwardingIssuer,
    aud: bridgeForwardingAudience,
    jti,
    sub: subject,
    principal: options.principal,
    transport: 'bridge',
    purpose: options.operation,
    functionRef: options.functionRef,
    args: options.args,
    ttlMs: bridgeForwardingTtlsMs[options.operation],
  })
}

function createBridgeTrustedForwardingFields(
  args: Record<string, unknown>,
  principal: unknown,
  trustedForwardingKey: string,
  operation: 'query' | 'mutation' | 'action',
  component: ComponentBridgeFunctionRef,
  explicitFunctionRef?: string,
) {
  const functionRef = getBridgeFunctionRef(component, explicitFunctionRef)

  return {
    _trellisForwarding: createBridgeForwardingEnvelope({
      trustedForwardingKey,
      principal,
      args,
      operation,
      functionRef,
    }),
  }
}

export function createBridgeForwardingArgs(
  args: Record<string, unknown>,
  principal: unknown,
  trustedForwardingKey: string,
  operation: 'query' | 'mutation' | 'action',
  component: ComponentBridgeFunctionRef,
  explicitFunctionRef?: string,
): Record<string, unknown> {
  if (
    typeof principal === 'object' &&
    principal !== null &&
    'kind' in principal &&
    (principal as { kind?: unknown }).kind === 'anonymous'
  ) {
    return args
  }

  return {
    ...args,
    ...createBridgeTrustedForwardingFields(
      args,
      principal,
      trustedForwardingKey,
      operation,
      component,
      explicitFunctionRef,
    ),
  }
}
