import { createHmac, timingSafeEqual } from 'node:crypto'

import { createError } from 'h3'

function toUtf8Buffer(value: string): Buffer {
  return Buffer.from(value, 'utf8')
}

function singleHeader(value: string | string[] | undefined): string | null {
  return typeof value === 'string' ? value : null
}

function safeEqualString(left: string, right: string): boolean {
  const leftBuffer = toUtf8Buffer(left)
  const rightBuffer = toUtf8Buffer(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

/**
 * Shared-secret webhook auth compares one header directly to a server secret.
 * It does not bind the request body, timestamp, or delivery id.
 */
export function isSharedSecretWebhookSignatureValid(
  providedSignature: string | string[] | undefined,
  expectedSecret: string,
): boolean {
  if (typeof providedSignature !== 'string') {
    return false
  }

  return safeEqualString(providedSignature, expectedSecret)
}

export type ReadSharedSecretWebhookBodyOptions<TBody, TParsed = TBody> = {
  signature: string | string[] | undefined
  secret: string
  readBody: () => Promise<TBody>
  parse?: (body: TBody) => TParsed | Promise<TParsed>
  idempotency?: {
    key: string | (() => string | Promise<string>)
    consume: (key: string) => boolean | Promise<boolean>
    conflictMessage?: string
  }
}

async function resolveIdempotencyKey(
  value: string | (() => string | Promise<string>),
): Promise<string> {
  return typeof value === 'function' ? await value() : value
}

export async function readSharedSecretWebhookBody<TBody, TParsed = TBody>(
  options: ReadSharedSecretWebhookBodyOptions<TBody, TParsed>,
): Promise<TParsed> {
  if (!isSharedSecretWebhookSignatureValid(options.signature, options.secret)) {
    throw createError({ statusCode: 401, message: 'Invalid signature' })
  }

  const parsedBody = options.parse
    ? await options.parse(await options.readBody())
    : ((await options.readBody()) as TParsed)

  if (options.idempotency) {
    const key = await resolveIdempotencyKey(options.idempotency.key)
    if (!key.trim()) {
      throw createError({
        statusCode: 500,
        message: 'Webhook idempotency key must resolve to a non-empty string.',
      })
    }

    const accepted = await options.idempotency.consume(key)
    if (!accepted) {
      throw createError({
        statusCode: 409,
        message: options.idempotency.conflictMessage ?? 'Duplicate webhook delivery.',
      })
    }
  }

  return parsedBody
}

export type WebhookHmacVerificationOptions = {
  signature: string | string[] | undefined
  timestamp: string | string[] | undefined
  deliveryId: string | string[] | undefined
  secret: string
  rawBody: string | Uint8Array
  nowMs?: number
  toleranceMs?: number
}

const DEFAULT_WEBHOOK_HMAC_TOLERANCE_MS = 5 * 60 * 1000

function normalizeTimestampMs(timestamp: string): number | null {
  if (!/^\d+$/.test(timestamp)) return null
  const value = Number(timestamp)
  if (!Number.isSafeInteger(value)) return null
  return value < 10_000_000_000 ? value * 1000 : value
}

function hmacPayload(options: {
  timestamp: string
  deliveryId: string
  rawBody: string | Uint8Array
}): Buffer {
  const body =
    typeof options.rawBody === 'string'
      ? toUtf8Buffer(options.rawBody)
      : Buffer.from(options.rawBody)
  return Buffer.concat([
    toUtf8Buffer(options.timestamp),
    toUtf8Buffer('.'),
    toUtf8Buffer(options.deliveryId),
    toUtf8Buffer('.'),
    body,
  ])
}

export function createWebhookHmacSignature(options: {
  secret: string
  timestamp: string
  deliveryId: string
  rawBody: string | Uint8Array
}): string {
  const digest = createHmac('sha256', options.secret).update(hmacPayload(options)).digest('hex')
  return `sha256=${digest}`
}

export function isWebhookHmacSignatureValid(options: WebhookHmacVerificationOptions): boolean {
  const signature = singleHeader(options.signature)
  const timestamp = singleHeader(options.timestamp)
  const deliveryId = singleHeader(options.deliveryId)
  if (!signature || !timestamp || !deliveryId || !deliveryId.trim()) return false

  const timestampMs = normalizeTimestampMs(timestamp)
  if (timestampMs === null) return false
  const nowMs = options.nowMs ?? Date.now()
  if (Math.abs(nowMs - timestampMs) > (options.toleranceMs ?? DEFAULT_WEBHOOK_HMAC_TOLERANCE_MS)) {
    return false
  }

  const expected = createWebhookHmacSignature({
    secret: options.secret,
    timestamp,
    deliveryId,
    rawBody: options.rawBody,
  })
  return safeEqualString(signature, expected)
}

export type ReadHmacVerifiedWebhookBodyOptions<TParsed> = WebhookHmacVerificationOptions & {
  parse: (rawBody: string | Uint8Array) => TParsed | Promise<TParsed>
  idempotency?: {
    consume: (deliveryId: string) => boolean | Promise<boolean>
    conflictMessage?: string
  }
}

export async function readHmacVerifiedWebhookBody<TParsed>(
  options: ReadHmacVerifiedWebhookBodyOptions<TParsed>,
): Promise<TParsed> {
  if (!isWebhookHmacSignatureValid(options)) {
    throw createError({ statusCode: 401, message: 'Invalid signature' })
  }

  const deliveryId = singleHeader(options.deliveryId)!
  if (options.idempotency) {
    const accepted = await options.idempotency.consume(deliveryId)
    if (!accepted) {
      throw createError({
        statusCode: 409,
        message: options.idempotency.conflictMessage ?? 'Duplicate webhook delivery.',
      })
    }
  }

  return await options.parse(options.rawBody)
}
