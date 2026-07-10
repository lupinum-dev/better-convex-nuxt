// Prototype of vNext §5.6 / §7 ConvexCallError.
// Framework-free (no Nuxt imports). `cause` is a runtime-only debugging field
// and is NEVER serialized (toJSON omits it).

export type ConvexCallErrorKind = 'authentication' | 'transport' | 'server' | 'unknown'

export interface ConvexCallErrorInput {
  kind: ConvexCallErrorKind
  message: string
  code?: string
  status?: number
  data?: unknown
  cause?: unknown
}

export class ConvexCallError extends Error {
  readonly kind: ConvexCallErrorKind
  readonly code?: string
  readonly status?: number
  readonly data?: unknown
  override readonly cause?: unknown

  constructor(input: ConvexCallErrorInput) {
    super(input.message, input.cause === undefined ? undefined : { cause: input.cause })
    this.name = 'ConvexCallError'
    this.kind = input.kind
    this.code = input.code
    this.status = input.status
    this.data = input.data
    this.cause = input.cause
  }

  toJSON() {
    return {
      name: this.name,
      kind: this.kind,
      message: this.message,
      code: this.code,
      status: this.status,
      data: this.data,
    }
  }
}

// Strict structural validation of the serialized public fields.
// Must NOT revive arbitrary objects solely because they carry a `name` string.
export function isSerializedConvexCallError(
  value: unknown,
): value is ReturnType<ConvexCallError['toJSON']> {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  if (v.name !== 'ConvexCallError') return false
  if (typeof v.kind !== 'string') return false
  if (!['authentication', 'transport', 'server', 'unknown'].includes(v.kind)) return false
  if (typeof v.message !== 'string') return false
  if (v.code !== undefined && typeof v.code !== 'string') return false
  if (v.status !== undefined && typeof v.status !== 'number') return false
  // `data` is intentionally unconstrained (verbatim product payload), but the
  // serialized shape must NOT carry a `cause` key.
  if ('cause' in v) return false
  return true
}
