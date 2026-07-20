import { convexToJson, type Value } from 'convex/values'

const textEncoder = new TextEncoder()

/**
 * The exact-call laboratory deliberately delegates Convex value semantics to
 * the pinned Convex SDK. `convexToJson` recursively sorts object fields and
 * uses Convex's reserved encodings for int64, bytes, and special floats.
 */
export class CanonicalConvexValueError extends Error {
  readonly code = 'EXACT_CALL_ARGUMENTS_INVALID'

  constructor() {
    super('Exact-call arguments are not valid Convex values')
    this.name = 'CanonicalConvexValueError'
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

export function canonicalConvexJson(value: Value): string {
  try {
    return JSON.stringify(convexToJson(value))
  } catch {
    // Convex's diagnostic includes the rejected value. The bridge must never
    // turn that value-bearing message into an observability or HTTP surface.
    throw new CanonicalConvexValueError()
  }
}

export async function digestConvexValue(value: Value): Promise<string> {
  try {
    const encoded = textEncoder.encode(canonicalConvexJson(value))
    const digest = await crypto.subtle.digest('SHA-256', encoded)
    return `sha256:${bytesToBase64Url(new Uint8Array(digest))}`
  } catch (error) {
    if (error instanceof CanonicalConvexValueError) throw error
    throw new CanonicalConvexValueError()
  }
}
