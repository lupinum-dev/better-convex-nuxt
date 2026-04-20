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
