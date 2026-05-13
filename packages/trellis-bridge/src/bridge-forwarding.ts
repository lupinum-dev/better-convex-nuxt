import {
  createIdentityForwardingEnvelope,
  extractSubject,
  getIdentityForwardingKeyProductionIssue,
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
  'operation-execute': 10_000,
} satisfies Record<BridgeForwardingPurpose, number>

type BridgeForwardingPurpose = 'query' | 'mutation' | 'action' | 'operation-execute'
export type IdentityForwardingKeyInput = string | ((args?: unknown) => string)

function resolveBridgeCallerSubject(caller: unknown): string {
  if (
    typeof caller === 'object' &&
    caller !== null &&
    'kind' in caller &&
    (caller as { kind?: unknown }).kind === 'anonymous'
  ) {
    throw new Error('createComponentBridge() cannot forward an anonymous caller.')
  }

  const subject = extractSubject(caller)
  if (!subject) {
    throw new Error(
      'createComponentBridge() requires the resolved caller to include a canonical subject.',
    )
  }

  return subject
}

export function getRequiredBridgeIdentityForwardingKey(
  override?: IdentityForwardingKeyInput,
  args?: unknown,
): string {
  const overrideValue = typeof override === 'function' ? override(args) : override
  const identityForwardingKey =
    overrideValue?.trim() ||
    (typeof process !== 'undefined' ? process.env?.CONVEX_IDENTITY_FORWARDING_KEY?.trim() : '')
  if (!identityForwardingKey) {
    throw new Error('createComponentBridge() requires CONVEX_IDENTITY_FORWARDING_KEY to be set.')
  }
  const identityForwardingKeyIssue = getIdentityForwardingKeyProductionIssue(identityForwardingKey)
  if (identityForwardingKeyIssue) {
    throw new Error(identityForwardingKeyIssue)
  }

  return identityForwardingKey
}

export function getBridgeFunctionRef(
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
  identityForwardingKey: string
  caller: unknown
  operation: BridgeForwardingPurpose
  functionRef: string
  args: Record<string, unknown>
  jtiPrefix?: string
}

/**
 * Sign a identity-forwarding envelope using the bridge-standard issuer,
 * audience, key id, and TTLs. Bridge consumers (e.g. CLI tools that call
 * the Convex component with a deploy-key caller) should use this
 * instead of constructing envelopes themselves so the signing parameters
 * stay single-sourced.
 */
export function createBridgeForwardingEnvelope(
  options: CreateBridgeForwardingEnvelopeOptions,
): string {
  const subject = resolveBridgeCallerSubject(options.caller)
  const jti = options.jtiPrefix ? `${options.jtiPrefix}-${createBridgeJti()}` : createBridgeJti()
  return createIdentityForwardingEnvelope({
    key: options.identityForwardingKey,
    keyId:
      (typeof process !== 'undefined' ? process.env?.CONVEX_IDENTITY_FORWARDING_KEY_ID : '') ||
      bridgeForwardingKeyId,
    iss: bridgeForwardingIssuer,
    aud: bridgeForwardingAudience,
    jti,
    sub: subject,
    caller: options.caller,
    transport: 'bridge',
    purpose: options.operation,
    functionRef: options.functionRef,
    args: options.args,
    ttlMs: bridgeForwardingTtlsMs[options.operation],
  })
}

function createBridgeIdentityForwardingFields(
  args: Record<string, unknown>,
  caller: unknown,
  identityForwardingKey: IdentityForwardingKeyInput,
  operation: BridgeForwardingPurpose,
  component: ComponentBridgeFunctionRef,
  explicitFunctionRef?: string,
) {
  const functionRef = getBridgeFunctionRef(component, explicitFunctionRef)
  const key =
    typeof identityForwardingKey === 'function'
      ? identityForwardingKey(args)
      : identityForwardingKey

  return {
    _trellisForwarding: createBridgeForwardingEnvelope({
      identityForwardingKey: key,
      caller,
      args,
      operation,
      functionRef,
    }),
  }
}

export function createBridgeForwardingArgs(
  args: Record<string, unknown>,
  caller: unknown,
  identityForwardingKey: IdentityForwardingKeyInput,
  operation: BridgeForwardingPurpose,
  component: ComponentBridgeFunctionRef,
  explicitFunctionRef?: string,
): Record<string, unknown> {
  if (
    typeof caller === 'object' &&
    caller !== null &&
    'kind' in caller &&
    (caller as { kind?: unknown }).kind === 'anonymous'
  ) {
    return args
  }

  return {
    ...args,
    ...createBridgeIdentityForwardingFields(
      args,
      caller,
      identityForwardingKey,
      operation,
      component,
      explicitFunctionRef,
    ),
  }
}
