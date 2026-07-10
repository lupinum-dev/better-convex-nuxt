// Phase 0 PROTOTYPE of the vNext server-boundary surface (vNext.md §9).
// This is NOT the shipped library; it prototypes the exact classify/sanitize
// contract so proofs 5 and 7 can validate the mechanics on the pinned stack
// (convex 1.38.0) before Phase 4 implements the real thing.

import { inspect } from 'node:util'

const CONVEX_ERROR_MARKER = Symbol.for('ConvexError')
const INSPECT_CUSTOM = Symbol.for('nodejs.util.inspect.custom')

// ---------------------------------------------------------------------------
// ConvexCallError — the ONLY error type that ever crosses the public boundary.
// Its safe view (kind/message/code/status/data) is the sole serialized/logged
// surface. `cause` may hold the raw upstream object but is NEVER exposed by
// toJSON(), util.inspect(), or the payload reducer.
// ---------------------------------------------------------------------------
export class ConvexCallError extends Error {
  constructor({ kind, message, code, status, data, cause }) {
    super(message)
    this.name = 'ConvexCallError'
    this.kind = kind
    if (code !== undefined) this.code = code
    if (status !== undefined) this.status = status
    if (data !== undefined) this.data = data
    // Non-enumerable so a naive {...err} / JSON.stringify / structuredClone
    // walk cannot pick it up. Only reachable via explicit `.cause`.
    if (cause !== undefined) {
      Object.defineProperty(this, 'cause', {
        value: cause,
        enumerable: false,
        writable: true,
        configurable: true,
      })
    }
  }

  // Safe view: the only fields any transport may serialize.
  toSafeView() {
    const view = { name: this.name, kind: this.kind, message: this.message }
    if (this.code !== undefined) view.code = this.code
    if (this.status !== undefined) view.status = this.status
    if (this.data !== undefined) view.data = this.data
    return view
  }

  toJSON() {
    return this.toSafeView()
  }

  // util.inspect / console.log(err) render ONLY the safe view — never `cause`.
  [INSPECT_CUSTOM]() {
    return `ConvexCallError ${inspect(this.toSafeView())}`
  }
}

function hasConvexErrorMarker(error) {
  return error != null && typeof error === 'object' && error[CONVEX_ERROR_MARKER] === true
}

// ---------------------------------------------------------------------------
// normalizeServerConvexBoundaryError (vNext.md §9)
//  - pass through existing ConvexCallError
//  - mechanically-recognized ConvexError -> `server`, PRESERVING structured data
//  - every other thrown value -> opaque `unknown`, raw only as non-serialized cause
// Never copies an unstructured client error's message/code/status/data.
// ---------------------------------------------------------------------------
export function normalizeServerConvexBoundaryError(error) {
  if (error instanceof ConvexCallError) {
    return error
  }
  if (hasConvexErrorMarker(error)) {
    // Legitimate application error contract: surface structured data as `server`.
    return new ConvexCallError({
      kind: 'server',
      // A ConvexError's message is the application-authored errorMessage — safe.
      message: typeof error.message === 'string' ? error.message : 'Convex application error',
      data: error.data,
      cause: error,
    })
  }
  // Opaque. `ConvexHttpClient` may put an arbitrary non-OK upstream body in
  // Error.message; that raw object survives ONLY as the non-serialized cause.
  return new ConvexCallError({
    kind: 'unknown',
    message: 'Convex server call failed',
    cause: error,
  })
}

// ---------------------------------------------------------------------------
// createClassifiedConvexFetch (vNext.md §9) — wraps transport-layer failures
// as `transport` ConvexCallError; does NOT intercept non-OK responses.
// ---------------------------------------------------------------------------
export function createClassifiedConvexFetch() {
  return async (input, init) => {
    try {
      return await fetch(input, init)
    } catch (cause) {
      throw new ConvexCallError({
        kind: 'transport',
        message: 'Convex HTTP request could not complete',
        cause,
      })
    }
  }
}

// ---------------------------------------------------------------------------
// Simulated Nuxt payload transport (definePayloadReducer/Reviver mechanics).
// The reducer serializes ONLY the safe view — cause is structurally excluded.
// ---------------------------------------------------------------------------
export function payloadReduce(value) {
  if (value instanceof ConvexCallError) {
    return ['ConvexCallError', value.toSafeView()]
  }
  return undefined
}

export function serializeNuxtPayload(value) {
  // Mirrors how Nuxt walks a payload: reducer first, else JSON.
  const reduced = payloadReduce(value)
  if (reduced) return JSON.stringify(reduced)
  return JSON.stringify(value)
}
