import type { GenericValidator } from 'convex/values'
import { v } from 'convex/values'

import type { SerializableValue, ValidateSerializable } from '../types/type-utils.js'
import { isNonEmptyPlainObject } from '../utils/value-helpers.js'

export type OperationPreviewIssue = {
  code: string
  message: string
  details?: SerializableValue
}

export type OperationPreviewEffect = {
  kind: string
  summary: string
  count?: number
  target?: string
  details?: SerializableValue
}

export type OperationPreviewConfirmation = {
  token: string
  expiresAt: number
}

export type OperationPreviewEnvelope<
  TConfirm extends Record<string, unknown> = Record<string, unknown>,
  TDetails = unknown,
> = {
  allowed: boolean
  summary: string
  blockers: OperationPreviewIssue[]
  warnings: OperationPreviewIssue[]
  effects: OperationPreviewEffect[]
  confirm: ValidateSerializable<TConfirm>
  confirmation?: OperationPreviewConfirmation
  version?: ValidateSerializable<SerializableValue>
  details?: ValidateSerializable<TDetails>
}

export function operationIssue(input: {
  code: string
  message: string
  details?: SerializableValue
}): OperationPreviewIssue {
  return {
    code: input.code,
    message: input.message,
    ...(input.details === undefined ? {} : { details: input.details }),
  }
}

export function operationEffect(input: {
  kind: string
  summary: string
  count?: number
  target?: string
  details?: SerializableValue
}): OperationPreviewEffect {
  return {
    kind: input.kind,
    summary: input.summary,
    ...(input.count === undefined ? {} : { count: input.count }),
    ...(input.target === undefined ? {} : { target: input.target }),
    ...(input.details === undefined ? {} : { details: input.details }),
  }
}

export function operationPreview<
  TConfirm extends Record<string, unknown>,
  TDetails = unknown,
>(input: {
  summary: string
  confirm: ValidateSerializable<TConfirm>
  allowed?: boolean
  blockers?: OperationPreviewIssue[]
  warnings?: OperationPreviewIssue[]
  effects?: OperationPreviewEffect[]
  version?: SerializableValue
  details?: ValidateSerializable<TDetails>
}): OperationPreviewEnvelope<TConfirm, TDetails> {
  const blockers = input.blockers ?? []
  return {
    allowed: input.allowed ?? blockers.length === 0,
    summary: input.summary,
    blockers,
    warnings: input.warnings ?? [],
    effects: input.effects ?? [],
    confirm: input.confirm,
    ...(input.version === undefined ? {} : { version: input.version }),
    ...(input.details === undefined ? {} : { details: input.details }),
  }
}

export function blockedOperationPreview<
  TConfirm extends Record<string, unknown>,
  TDetails = unknown,
>(input: {
  summary: string
  confirm: ValidateSerializable<TConfirm>
  blockers: OperationPreviewIssue[]
  warnings?: OperationPreviewIssue[]
  effects?: OperationPreviewEffect[]
  version?: SerializableValue
  details?: ValidateSerializable<TDetails>
}): OperationPreviewEnvelope<TConfirm, TDetails> {
  return operationPreview({
    ...input,
    allowed: false,
  })
}

export const operationPreviewIssueValidator = v.object({
  code: v.string(),
  message: v.string(),
  details: v.optional(v.any()),
})

export const operationPreviewEffectValidator = v.object({
  kind: v.string(),
  summary: v.string(),
  count: v.optional(v.number()),
  target: v.optional(v.string()),
  details: v.optional(v.any()),
})

export function operationPreviewValidator<
  TConfirm extends GenericValidator = GenericValidator,
  TDetails extends GenericValidator = GenericValidator,
>(options?: { confirm?: TConfirm; details?: TDetails }): GenericValidator {
  return v.object({
    allowed: v.boolean(),
    summary: v.string(),
    blockers: v.array(operationPreviewIssueValidator),
    warnings: v.array(operationPreviewIssueValidator),
    effects: v.array(operationPreviewEffectValidator),
    confirm: options?.confirm ?? v.record(v.string(), v.any()),
    confirmation: v.optional(
      v.object({
        token: v.string(),
        expiresAt: v.number(),
      }),
    ),
    version: v.optional(v.any()),
    details: v.optional(options?.details ?? v.any()),
  })
}

export function isOperationPreviewEnvelope(value: unknown): value is OperationPreviewEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as OperationPreviewEnvelope).allowed === 'boolean' &&
    typeof (value as OperationPreviewEnvelope).summary === 'string' &&
    Array.isArray((value as OperationPreviewEnvelope).blockers) &&
    Array.isArray((value as OperationPreviewEnvelope).warnings) &&
    Array.isArray((value as OperationPreviewEnvelope).effects) &&
    isNonEmptyPlainObject((value as OperationPreviewEnvelope).confirm)
  )
}
