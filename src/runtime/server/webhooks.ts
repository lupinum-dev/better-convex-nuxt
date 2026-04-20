import { createError } from 'h3'
import { timingSafeEqual } from 'node:crypto'

function toUtf8Buffer(value: string): Buffer {
  return Buffer.from(value, 'utf8')
}

export function isWebhookSignatureValid(
  providedSignature: string | string[] | undefined,
  expectedSecret: string,
): boolean {
  if (typeof providedSignature !== 'string') {
    return false
  }

  const provided = toUtf8Buffer(providedSignature)
  const expected = toUtf8Buffer(expectedSecret)

  if (provided.length !== expected.length) {
    return false
  }

  return timingSafeEqual(provided, expected)
}

export type ReadVerifiedWebhookBodyOptions<TBody, TParsed = TBody> = {
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

export async function readVerifiedWebhookBody<TBody, TParsed = TBody>(
  options: ReadVerifiedWebhookBodyOptions<TBody, TParsed>,
): Promise<TParsed> {
  if (!isWebhookSignatureValid(options.signature, options.secret)) {
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
