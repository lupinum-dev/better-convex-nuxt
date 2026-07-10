import { ConvexError } from 'convex/values'

/**
 * The public, framework-free error contract for Better Convex Nuxt (vNext §7,
 * §5.6, internal §9).
 *
 * This module is deliberately unaware of Nuxt, Vue, Nitro, Better Auth, the DOM,
 * and Node built-ins. Its only third-party import is the public Convex error
 * value (`convex/values`), because honest classification of application errors
 * requires recognizing `ConvexError`. The boundary is enforced mechanically by
 * `scripts/check-boundaries.mjs` (`errors-framework-free`) and by the packed
 * purity probe (internal §16.2).
 */

/**
 * The locked public kind set (vNext §5.6). There is intentionally NO
 * `validation` kind: the pinned Convex 1.32/1.38 packages expose no stable
 * argument-validation class or marker, and vNext never classifies from message
 * text. Add a new kind only when a future pinned Convex release provides a
 * mechanically testable signal.
 *
 * | Kind             | Only valid sources                                               |
 * | ---------------- | ---------------------------------------------------------------- |
 * | `authentication` | Missing required identity, token exchange 401/403, explicit      |
 * |                  | auth-engine classification.                                      |
 * | `transport`      | Fetch/XHR failure, timeout, abort, unusable/oversized/malformed  |
 * |                  | response, or unexpected upstream HTTP response observed at a     |
 * |                  | library-owned HTTP boundary.                                     |
 * | `server`         | Convex application/function error with `data` preserved verbatim.|
 * | `unknown`        | Anything not mechanically classifiable above.                    |
 */
export type ConvexCallErrorKind = 'authentication' | 'transport' | 'server' | 'unknown'

/**
 * The result envelope returned by every `.safe()` callable variant.
 *
 * The error entry owns this type so consumers have one framework-free import
 * location for both throwing and non-throwing call contracts.
 */
export type CallResult<T, E = ConvexCallError> = { ok: true; data: T } | { ok: false; error: E }

const CONVEX_CALL_ERROR_KINDS: readonly ConvexCallErrorKind[] = [
  'authentication',
  'transport',
  'server',
  'unknown',
]

export interface ConvexCallErrorInput {
  kind: ConvexCallErrorKind
  message: string
  code?: string
  status?: number
  data?: unknown
  cause?: unknown
}

/**
 * The single honest error type every throwing and safe Convex call exposes.
 *
 * `cause` is a runtime-only debugging field. It is never serialized: it is
 * absent from {@link ConvexCallError.toJSON}, from `JSON.stringify(error)`, from
 * SSR HTML, from Nuxt payload JSON, and from logs. Library-owned credentials,
 * tokens, cookies, request/response objects, and authorization headers must only
 * ever live in `cause`, never in the public fields.
 */
export class ConvexCallError extends Error {
  readonly kind: ConvexCallErrorKind
  readonly code?: string
  readonly status?: number
  readonly data?: unknown

  // Under the module's `useDefineForClassFields: true` target, a plain field
  // initializer would clobber the `cause` slot `super(...)` installs. The
  // constructor instead re-installs `cause` as a NON-ENUMERABLE own property so
  // it is invisible to enumeration, spreads, `JSON.stringify`, and structured
  // clone — while remaining directly readable as `error.cause` for debugging.
  // The server-security proof (§16.2) proved this shape, plus the custom
  // inspect below, load-bearing for log-cleanliness: Node's error formatter
  // prints `[cause]` for a plain Error even when non-enumerable, so the inspect
  // hook is what actually keeps a `cause`-only secret out of console output.
  override readonly cause?: unknown

  constructor(input: ConvexCallErrorInput) {
    super(input.message, input.cause === undefined ? undefined : { cause: input.cause })
    this.name = 'ConvexCallError'
    this.kind = input.kind
    this.code = input.code
    this.status = input.status
    this.data = input.data
    Object.defineProperty(this, 'cause', {
      value: input.cause,
      enumerable: false,
      writable: false,
      configurable: true,
    })
  }

  /**
   * The public serialized shape. `cause` is intentionally omitted so no
   * runtime-only debugging value (and therefore no secret that only ever lived
   * in `cause`) can escape into a payload, log, or DevTools event.
   */
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

/**
 * Node's custom-inspection hook (referenced by its well-known key, NOT imported
 * from `node:util`, so the framework-free purity guard stays satisfied). When a
 * `ConvexCallError` reaches a server-side `console.*` call, Node renders this
 * redacted public shape instead of the default error format — which would
 * otherwise print `[cause]` (and any credential that only ever lived there) even
 * though `cause` is non-enumerable. Returning `toJSON()` guarantees logs carry
 * exactly the serialized public contract and never the raw `cause`.
 */
const NODE_INSPECT_CUSTOM = Symbol.for('nodejs.util.inspect.custom')
Object.defineProperty(ConvexCallError.prototype, NODE_INSPECT_CUSTOM, {
  value(this: ConvexCallError) {
    return this.toJSON()
  },
  enumerable: false,
  writable: true,
  configurable: true,
})

/** The exact object shape produced by {@link ConvexCallError.toJSON}. */
export interface SerializedConvexCallError {
  name: 'ConvexCallError'
  kind: ConvexCallErrorKind
  message: string
  code?: string
  status?: number
  data?: unknown
}

// ---------------------------------------------------------------------------
// Framework-free helpers (all referenced by the normalizer, all in-module).
// ---------------------------------------------------------------------------

function isRecordLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function isConvexCallErrorKind(value: unknown): value is ConvexCallErrorKind {
  return CONVEX_CALL_ERROR_KINDS.includes(value as ConvexCallErrorKind)
}

/**
 * Recognize a Convex application error through the pinned `ConvexError` contract
 * OR its exact cross-package marker `error[Symbol.for('ConvexError')] === true`,
 * matching Convex's installed implementation. Marker equality keeps structured
 * application errors recognizable when the host and library resolve different
 * physical Convex copies. Mere property presence is insufficient.
 */
function isConvexApplicationError(error: unknown): boolean {
  if (error instanceof ConvexError) return true
  if (!isRecordLike(error)) return false
  return (error as Record<PropertyKey, unknown>)[Symbol.for('ConvexError')] === true
}

/**
 * Extract a display message without ever inferring classification from its text.
 */
function readErrorMessage(error: unknown): string {
  if (typeof error === 'string') return asNonEmptyString(error) ?? 'Unknown Convex error'
  if (error instanceof Error) return asNonEmptyString(error.message) ?? 'Unknown Convex error'
  if (isRecordLike(error)) {
    const message = asNonEmptyString(error.message)
    if (message) return message
  }
  return 'Unknown Convex error'
}

/** The Convex application error's structured payload, preserved verbatim. */
function readStructuredData(error: unknown): unknown {
  return isRecordLike(error) ? error.data : undefined
}

/** A stable string code, preferring the structured `data.code` when present. */
function readCode(error: unknown): string | undefined {
  const data = readStructuredData(error)
  if (isRecordLike(data)) {
    const fromData = asNonEmptyString(data.code)
    if (fromData) return fromData
  }
  return isRecordLike(error) ? asNonEmptyString(error.code) : undefined
}

/** A numeric status, preferring the structured `data.status` when present. */
function readStatus(error: unknown): number | undefined {
  const data = readStructuredData(error)
  if (isRecordLike(data)) {
    const fromData = asFiniteNumber(data.status)
    if (fromData !== undefined) return fromData
  }
  return isRecordLike(error) ? asFiniteNumber(error.status) : undefined
}

/**
 * Mechanically safe, framework-free normalization (vNext §7, internal §9.2).
 *
 * - An existing {@link ConvexCallError} passes through unchanged, so
 *   re-normalizing a boundary-classified `transport`/`authentication` instance
 *   never downgrades it.
 * - A Convex application error becomes `server` with its `data` preserved
 *   verbatim.
 * - Everything else becomes `unknown`. The pure normalizer NEVER classifies a
 *   `TypeError` as `transport` (it cannot know whether user code or a network
 *   API created it) and NEVER classifies from message text. Fetch, XHR,
 *   timeout, abort, oversized-, malformed-, and unexpected-upstream-HTTP
 *   boundaries construct `ConvexCallError({ kind: 'transport', ... })`
 *   themselves, while the boundary still knows the source.
 */
export function normalizeConvexError(error: unknown): ConvexCallError {
  if (error instanceof ConvexCallError) return error
  if (isConvexApplicationError(error)) {
    return new ConvexCallError({
      kind: 'server',
      message: readErrorMessage(error),
      code: readCode(error),
      status: readStatus(error),
      data: readStructuredData(error),
      cause: error,
    })
  }
  return new ConvexCallError({
    kind: 'unknown',
    message: readErrorMessage(error),
    cause: error,
  })
}

/**
 * Strict structural validation of the serialized public fields (vNext §7,
 * internal §9.3). This gates payload revival: an arbitrary object is NOT revived
 * just because it carries `name: 'ConvexCallError'` — every public field must
 * be present and well-typed. `cause` is never part of the serialized shape.
 */
export function isSerializedConvexCallError(value: unknown): value is SerializedConvexCallError {
  if (!isRecordLike(value)) return false
  if (value.name !== 'ConvexCallError') return false
  if (!isConvexCallErrorKind(value.kind)) return false
  if (typeof value.message !== 'string') return false
  if (value.code !== undefined && typeof value.code !== 'string') return false
  if (value.status !== undefined && typeof value.status !== 'number') return false
  return true
}
