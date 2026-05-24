import {
  createConfirmationToken,
  hashConfirmationValue,
  hashConfirmationToken,
  normalizeStoredConfirmationPayload,
  type StoredToolConfirmationPayload,
  type ToolConfirmationPayload,
} from '../functions/confirmation-token.js'
/**
 * Owns destructive MCP confirmation mechanics.
 *
 * Security uses the whole-request `argsHash`. Per-field hashes are diagnostics
 * only: they help explain drift, but they must never decide whether a token is
 * valid. This module must not call Convex or own app/tool wiring.
 */
import { createDenialExplanation, type TrellisDenialExplanation } from '../observability/index.js'
import type { SerializableValue } from '../types/type-utils.js'
import type { ConvexErrorCategory } from '../utils/types.js'

type MaybePromise<T> = T | Promise<T>

export type McpConfirmationConfirmationInput = {
  tokenHash: string
  payload: ToolConfirmationPayload
  operationId: string
  callerKey: string
  scopeKey: string
  argsHash: string
  previewHash: string
  executePath: string
  previewPath: string
}

export type McpConfirmationCreateInput = {
  payload: ToolConfirmationPayload
  tokenHash: string
  createdAt: number
  expiresAt: number
}

export interface McpConfirmationStore {
  create(input: McpConfirmationCreateInput): MaybePromise<void>
  lookup(input: { tokenHash: string }): MaybePromise<StoredToolConfirmationPayload | null>
  redeem(input: McpConfirmationConfirmationInput): MaybePromise<'redeemed' | 'replayed'>
}

export const DEFAULT_MCP_CONFIRMATION_TTL_MS = 5 * 60 * 1000

export type DestructiveConfirmationBinding = {
  operationId: string
  executePath: string
  previewPath: string
  callerKey: string
  scopeKey: string
  argsHash: string
  argsFieldHashes: Record<string, string>
}

export type DestructiveConfirmationFailure = {
  category: ConvexErrorCategory
  code: string
  message: string
  details: Record<string, unknown>
  explanation: TrellisDenialExplanation
}

export function createMemoryConfirmationStore(): McpConfirmationStore {
  const confirmations = new Map<string, StoredToolConfirmationPayload>()
  return {
    create(input) {
      confirmations.set(input.tokenHash, {
        ...input.payload,
        tokenHash: input.tokenHash,
        createdAt: input.createdAt,
        expiresAt: input.expiresAt,
      })
    },
    lookup(input) {
      return confirmations.get(input.tokenHash) ?? null
    },
    redeem(input) {
      const stored = confirmations.get(input.tokenHash)
      if (!stored || typeof stored.redeemedAt === 'number') return 'replayed'
      confirmations.set(input.tokenHash, {
        ...stored,
        redeemedAt: Date.now(),
      })
      return 'redeemed'
    },
  }
}

export function assertProductionConfirmationStore(options: {
  toolName: string
  destructive: boolean
  confirmationMode: 'backend' | 'transport'
  hasExplicitConfirmationStore: boolean
}): void {
  if (
    process.env.NODE_ENV !== 'production' ||
    !options.destructive ||
    options.confirmationMode !== 'transport' ||
    options.hasExplicitConfirmationStore
  ) {
    return
  }

  throw new Error(
    `${options.toolName}: production destructive MCP tools with confirmationMode: "transport" require an explicit distributed confirmationStore.`,
  )
}

export async function hashArgsForDiagnostics(
  value: Record<string, unknown>,
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(async ([key, fieldValue]) => [key, await hashConfirmationValue(fieldValue)] as const),
  )
  return Object.fromEntries(entries)
}

export function diffDiagnosticArgHashes(
  previous: Record<string, string> | undefined,
  current: Record<string, string>,
): string[] {
  if (!previous) return []
  return Array.from(new Set([...Object.keys(previous), ...Object.keys(current)]))
    .filter((key) => previous[key] !== current[key])
    .sort()
}

export async function hashPreviewVersion(
  version: SerializableValue | undefined,
): Promise<string | null> {
  return version === undefined ? null : await hashConfirmationValue(version)
}

export async function createDestructivePreviewToken(input: {
  binding: DestructiveConfirmationBinding
  previewHash: string
  versionHash: string | null
  confirmationStore: McpConfirmationStore
  ttlMs?: number
}): Promise<{ token: string; expiresAt: number }> {
  const token = createConfirmationToken()
  const tokenHash = await hashConfirmationToken(token)
  const now = Date.now()
  const expiresAt = now + (input.ttlMs ?? DEFAULT_MCP_CONFIRMATION_TTL_MS)
  await input.confirmationStore.create({
    tokenHash,
    createdAt: now,
    expiresAt,
    payload: {
      operationId: input.binding.operationId,
      executePath: input.binding.executePath,
      previewPath: input.binding.previewPath,
      jti: crypto.randomUUID(),
      callerKey: input.binding.callerKey,
      scopeKey: input.binding.scopeKey,
      argsHash: input.binding.argsHash,
      argsFieldHashes: input.binding.argsFieldHashes,
      previewHash: input.previewHash,
      ...(input.versionHash ? { versionHash: input.versionHash } : {}),
    },
  })
  return { token, expiresAt }
}

function confirmationExplanation(message: string): TrellisDenialExplanation {
  return createDenialExplanation({
    reasonCode: 'tool.confirmation_mismatch',
    decision: 'destructive_confirm',
    message,
    suggestedAction: 'retry_with_confirmation',
  })
}

function failure(input: {
  category: ConvexErrorCategory
  code: string
  message: string
  details?: Record<string, unknown>
  explanationMessage: string
}): DestructiveConfirmationFailure {
  return {
    category: input.category,
    code: input.code,
    message: input.message,
    details: {
      retryWithPreview: true,
      ...(input.details ?? {}),
    },
    explanation: confirmationExplanation(input.explanationMessage),
  }
}

export async function verifyDestructiveConfirmationToken(
  token: string,
  binding: DestructiveConfirmationBinding,
  confirmationStore: McpConfirmationStore,
): Promise<
  | { ok: true; payload: ToolConfirmationPayload; tokenHash: string }
  | { ok: false; failure: DestructiveConfirmationFailure }
> {
  const tokenHash = await hashConfirmationToken(token)
  const stored = normalizeStoredConfirmationPayload(await confirmationStore.lookup({ tokenHash }))
  if (!stored || stored.expiresAt <= Date.now()) {
    return {
      ok: false,
      failure: failure({
        category: 'confirmation_required',
        code: 'CONFIRMATION_TOKEN_INVALID',
        message: 'Invalid or expired confirmation token. Preview again before executing.',
        explanationMessage: 'Confirmation token is invalid or expired.',
      }),
    }
  }
  if (typeof stored.redeemedAt === 'number') {
    return { ok: false, failure: replayedConfirmationFailure() }
  }

  const payload: ToolConfirmationPayload = stored

  const drifted =
    payload.operationId !== binding.operationId ||
    payload.executePath !== binding.executePath ||
    payload.previewPath !== binding.previewPath ||
    payload.callerKey !== binding.callerKey ||
    payload.scopeKey !== binding.scopeKey ||
    payload.argsHash !== binding.argsHash

  if (drifted) {
    const changedKeys = diffDiagnosticArgHashes(payload.argsFieldHashes, binding.argsFieldHashes)
    return {
      ok: false,
      failure: failure({
        category: 'conflict',
        code: 'CONFIRMATION_ARGS_MISMATCH',
        message:
          'Confirmation token no longer matches this destructive request. Repeat the same arguments byte-for-byte with the returned token, or preview again before executing.',
        details: changedKeys.length ? { changedKeys } : undefined,
        explanationMessage: 'Confirmation token no longer matches the previewed destructive state.',
      }),
    }
  }

  return { ok: true, payload, tokenHash }
}

export function validateDestructivePreviewState(input: {
  payload: ToolConfirmationPayload
  blocked: boolean
  previewHash: string
  versionHash: string | null
}): DestructiveConfirmationFailure | null {
  if (input.blocked) {
    return failure({
      category: 'conflict',
      code: 'CONFIRMATION_PREVIEW_BLOCKED',
      message:
        'Previewed state is blocked and can no longer be executed. Preview again before executing.',
      explanationMessage: 'Previewed state is now blocked and can no longer be executed.',
    })
  }

  if (input.payload.previewHash !== input.previewHash) {
    return failure({
      category: 'conflict',
      code: 'CONFIRMATION_PREVIEW_CHANGED',
      message: 'Previewed state changed before confirmation. Preview again before executing.',
      explanationMessage: 'Previewed state changed before confirmation completed.',
    })
  }

  if ((input.payload.versionHash ?? null) !== input.versionHash) {
    return failure({
      category: 'conflict',
      code: 'CONFIRMATION_PREVIEW_VERSION_CHANGED',
      message: 'Preview version changed before confirmation. Preview again before executing.',
      explanationMessage: 'Preview version changed before confirmation completed.',
    })
  }

  return null
}

export function replayedConfirmationFailure(): DestructiveConfirmationFailure {
  return failure({
    category: 'conflict',
    code: 'CONFIRMATION_TOKEN_REPLAYED',
    message: 'Confirmation token has already been redeemed. Preview again before executing.',
    explanationMessage: 'Confirmation token has already been redeemed.',
  })
}
