import { inspect } from 'node:util'

import { ConvexError } from 'convex/values'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  ConvexCallError,
  isSerializedConvexCallError,
  normalizeConvexError,
  type ConvexCallErrorInput,
} from '../../src/runtime/errors'
import { executeQueryHttp } from '../../src/runtime/utils/query-execution'

/**
 * Golden fixtures for the public error contract (architecture invariant).
 *
 * The pure normalizer classifies only from reliable evidence. It NEVER classifies
 * a `TypeError` as `transport` and NEVER classifies from message text. `transport`
 * and `authentication` are boundary-owned: a library-owned HTTP/auth boundary
 * constructs the instance while it still knows the source, and re-normalizing that
 * instance passes it through unchanged.
 */

const SECRET = 'super-secret-token-do-not-leak'

/** Throwing path: throw the normalized error. */
function throwingCall(raw: unknown): ConvexCallError {
  try {
    throw raw
  } catch (error) {
    return normalizeConvexError(error)
  }
}

/** Safe path: return the normalized error, same normalizer as the throwing path. */
function safeCall(raw: unknown): ConvexCallError {
  return normalizeConvexError(raw)
}

/** Mirror the payload plugin's reducer + reviver without importing Nuxt. */
function payloadRoundTrip(error: ConvexCallError): unknown {
  const reduced = JSON.parse(JSON.stringify(error.toJSON())) as unknown
  if (!isSerializedConvexCallError(reduced)) return undefined
  return new ConvexCallError({
    kind: reduced.kind,
    message: reduced.message,
    code: reduced.code,
    status: reduced.status,
    data: reduced.data,
  })
}

describe('ConvexCallError golden fixtures ', () => {
  it('1. auth-context-created authentication error (boundary-owned, passes through)', () => {
    const authError = new ConvexCallError({
      kind: 'authentication',
      message: 'Required identity missing',
      code: 'UNAUTHENTICATED',
      cause: { token: SECRET },
    })

    expect(authError.kind).toBe('authentication')
    // Re-normalizing a boundary-classified instance never downgrades it.
    expect(normalizeConvexError(authError)).toBe(authError)
    expect(authError.toJSON()).toEqual({
      name: 'ConvexCallError',
      kind: 'authentication',
      message: 'Required identity missing',
      code: 'UNAUTHENTICATED',
      status: undefined,
      data: undefined,
    })
  })

  it('2. unstructured Convex argument-validation failure stays unknown', () => {
    // The pinned Convex packages surface arg-validation failures as plain errors
    // with no structured marker; they must not be classified from message text.
    const validationFailure = new Error(
      'ArgumentValidationError: Object contains extra field `foo`',
    )
    const normalized = normalizeConvexError(validationFailure)
    expect(normalized.kind).toBe('unknown')
    expect(normalized).toBeInstanceOf(ConvexCallError)
  })

  it('3a. boundary-wrapped fetch rejection is transport and passes through', () => {
    const fetchRejection = new TypeError('Failed to fetch')
    // The HTTP boundary constructs the transport error while it knows the source.
    const boundary = new ConvexCallError({
      kind: 'transport',
      message: 'The request could not reach Convex.',
      cause: fetchRejection,
    })
    expect(boundary.kind).toBe('transport')
    expect(normalizeConvexError(boundary)).toBe(boundary)
    expect(boundary.cause).toBe(fetchRejection)
  })

  it('3b. a plain application TypeError stays unknown (never transport)', () => {
    const appTypeError = new TypeError("Cannot read properties of undefined (reading 'id')")
    const normalized = normalizeConvexError(appTypeError)
    expect(normalized.kind).toBe('unknown')
  })

  it('4. timeout / abort is boundary-owned transport', () => {
    const abort = new DOMException('The operation was aborted.', 'AbortError')
    const boundary = new ConvexCallError({
      kind: 'transport',
      code: 'ABORTED',
      message: 'The request timed out.',
      cause: abort,
    })
    expect(boundary.kind).toBe('transport')
    expect(boundary.code).toBe('ABORTED')
    expect(normalizeConvexError(boundary)).toBe(boundary)
  })

  it('5. unexpected upstream HTTP response is boundary-owned transport', () => {
    const boundary = new ConvexCallError({
      kind: 'transport',
      status: 502,
      message: 'Convex returned an unexpected response.',
      cause: { rawBody: SECRET },
    })
    expect(boundary.kind).toBe('transport')
    expect(boundary.status).toBe(502)
    // The sentinel lives only in cause and never reaches the public shape.
    expect(JSON.stringify(boundary)).not.toContain(SECRET)
  })

  it('6. Convex application error with structured data is server, data verbatim', () => {
    const data = { code: 'UNAUTHORIZED', reason: 'forbidden', nested: { a: 1 } }
    const appError = new ConvexError(data)
    const normalized = normalizeConvexError(appError)

    expect(normalized.kind).toBe('server')
    // `data.code === 'UNAUTHORIZED'` remains server, never re-classified as auth.
    expect(normalized.code).toBe('UNAUTHORIZED')
    expect(normalized.data).toEqual(data)
    expect(normalized).toBeInstanceOf(ConvexCallError)
  })

  it('6b. cross-package ConvexError marker (not instanceof) is still server', () => {
    const markerOnly = {
      message: 'application error from a duplicate convex copy',
      data: { code: 'DUPLICATE_COPY' },
      [Symbol.for('ConvexError')]: true,
    }
    const normalized = normalizeConvexError(markerOnly)
    expect(normalized.kind).toBe('server')
    expect(normalized.data).toEqual({ code: 'DUPLICATE_COPY' })
  })

  it('6c. mere `data` property presence without the marker stays unknown', () => {
    const notAnApplicationError = { message: 'looks structured', data: { code: 'NOPE' } }
    expect(normalizeConvexError(notAnApplicationError).kind).toBe('unknown')
  })

  it('7. plain Error is unknown', () => {
    const normalized = normalizeConvexError(new Error('boom'))
    expect(normalized.kind).toBe('unknown')
    expect(normalized.message).toBe('boom')
  })

  it('8. string and object unknown errors', () => {
    const fromString = normalizeConvexError('a bare string failure')
    expect(fromString.kind).toBe('unknown')
    expect(fromString.message).toBe('a bare string failure')

    const fromMessageObject = normalizeConvexError({ message: 'object with message' })
    expect(fromMessageObject.kind).toBe('unknown')
    expect(fromMessageObject.message).toBe('object with message')

    const fromOpaqueObject = normalizeConvexError({ unrelated: true })
    expect(fromOpaqueObject.kind).toBe('unknown')
    expect(fromOpaqueObject.message).toBe('Unknown Convex error')
  })

  it('9. an existing ConvexCallError passes through unchanged (identity)', () => {
    const existing = new ConvexCallError({ kind: 'server', message: 'already normalized' })
    expect(normalizeConvexError(existing)).toBe(existing)
  })
})

describe('throwing and safe calls are equivalent ', () => {
  const rawFailures: Array<{ name: string; raw: unknown }> = [
    { name: 'plain Error', raw: new Error('boom') },
    { name: 'ConvexError', raw: new ConvexError({ code: 'X', reason: 'y' }) },
    { name: 'string', raw: 'bare string' },
    { name: 'opaque object', raw: { unrelated: 1 } },
  ]

  for (const { name, raw } of rawFailures) {
    it(`equal toJSON and both instanceof for ${name}`, () => {
      const thrown = throwingCall(raw)
      const safe = safeCall(raw)
      expect(thrown).toBeInstanceOf(ConvexCallError)
      expect(safe).toBeInstanceOf(ConvexCallError)
      expect(thrown.toJSON()).toEqual(safe.toJSON())
    })
  }
})

describe('ConvexCallError class contract: cause is runtime-only ', () => {
  const withSecret: ConvexCallErrorInput = {
    kind: 'transport',
    message: 'boundary failure',
    status: 500,
    cause: { authorization: `Bearer ${SECRET}`, cookie: SECRET },
  }

  it('keeps cause on the runtime instance', () => {
    const error = new ConvexCallError(withSecret)
    expect(error.cause).toEqual(withSecret.cause)
    expect(error).toBeInstanceOf(Error)
  })

  it('toJSON omits cause entirely', () => {
    const error = new ConvexCallError(withSecret)
    const json = error.toJSON()
    expect('cause' in json).toBe(false)
    expect(JSON.stringify(json)).not.toContain(SECRET)
  })

  it('JSON.stringify(error) is clean of cause content', () => {
    const error = new ConvexCallError(withSecret)
    const serialized = JSON.stringify(error)
    expect(serialized).not.toContain(SECRET)
    expect(serialized).not.toContain('authorization')
  })

  it('keeps cause non-enumerable so it never leaks through enumeration or logs', () => {
    const error = new ConvexCallError(withSecret)

    // Non-enumerable: absent from own keys, spreads, and default serialization.
    expect(Object.keys(error)).not.toContain('cause')
    expect(Object.getOwnPropertyDescriptor(error, 'cause')?.enumerable).toBe(false)
    expect(Object.prototype.hasOwnProperty.call({ ...error }, 'cause')).toBe(false)

    // The custom inspect hook renders only the redacted public shape, so a
    // server-side console.* of this error can never print the cause-only secret
    // (Node's default error formatter would otherwise show `[cause]`).
    const inspected = inspect(error)
    expect(inspected).not.toContain(SECRET)
    expect(inspected).not.toContain('authorization')
    expect(inspected).toContain('boundary failure')
  })

  it('survives a payload round-trip as instanceof ConvexCallError without cause', () => {
    const original = new ConvexCallError({
      kind: 'server',
      message: 'application failure',
      code: 'FORBIDDEN',
      status: 403,
      data: { code: 'FORBIDDEN', detail: 'nope' },
      cause: { secret: SECRET },
    })

    const revived = payloadRoundTrip(original)
    expect(revived).toBeInstanceOf(ConvexCallError)
    const typed = revived as ConvexCallError
    expect(typed.kind).toBe('server')
    expect(typed.message).toBe('application failure')
    expect(typed.code).toBe('FORBIDDEN')
    expect(typed.status).toBe(403)
    expect(typed.data).toEqual({ code: 'FORBIDDEN', detail: 'nope' })
    expect(typed.cause).toBeUndefined()
  })
})

describe('isSerializedConvexCallError strictness ', () => {
  it('accepts a valid serialized shape', () => {
    const valid = {
      name: 'ConvexCallError',
      kind: 'server',
      message: 'ok',
      code: undefined,
      status: undefined,
      data: undefined,
    }
    expect(isSerializedConvexCallError(valid)).toBe(true)
  })

  it('rejects an arbitrary object that only carries the name string', () => {
    expect(isSerializedConvexCallError({ name: 'ConvexCallError' })).toBe(false)
    expect(
      isSerializedConvexCallError({ name: 'ConvexCallError', kind: 'nope', message: 'x' }),
    ).toBe(false)
    expect(
      isSerializedConvexCallError({ name: 'ConvexCallError', kind: 'server', message: 42 }),
    ).toBe(false)
    expect(isSerializedConvexCallError('ConvexCallError')).toBe(false)
    expect(isSerializedConvexCallError(null)).toBe(false)
  })
})

/**
 * Audit gap (W8): the golden fixtures above exercise `normalizeConvexError`
 * directly, but the REAL library-owned HTTP boundary that must construct
 * `transport`/`server` classifications itself — `executeQueryHttp` (public
 * "Integrate the contract": "Normalize errors at query ... boundaries" /
 * "Preserve Convex HTTP `errorData` as `data` before normalization") — had no
 * direct unit coverage anywhere in the suite. These tests close that gap
 * cheaply (no Nuxt/e2e harness) using the same `vi.stubGlobal('$fetch', ...)`
 * pattern already established by `test/unit/convex-cache-auth-token.test.ts`.
 */
describe('executeQueryHttp boundary (architecture invariant)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('a $fetch rejection becomes a boundary-owned transport ConvexCallError, cause redacted', async () => {
    const secret = 'query-execution-boundary-secret'
    const fetchRejection = Object.assign(new Error('fetch failed'), {
      statusCode: 503,
      data: { rawBody: secret },
    })
    vi.stubGlobal(
      '$fetch',
      vi.fn(() => Promise.reject(fetchRejection)),
    )

    let caught: unknown
    try {
      await executeQueryHttp('https://example.convex.cloud', 'notes:list', {})
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(ConvexCallError)
    const error = caught as ConvexCallError
    expect(error.kind).toBe('transport')
    expect(error.status).toBe(503)
    // The fixed, safe public message never depends on the raw rejection.
    expect(error.message).toBe(
      'The request to Convex failed before a usable response was received.',
    )
    // The secret lives only in `cause` (the raw rejection) and never in a
    // public field or JSON.stringify(error).
    expect(error.cause).toBe(fetchRejection)
    expect(JSON.stringify(error)).not.toContain(secret)
  })

  it('a 200 envelope with structured errorData normalizes to server with data preserved verbatim', async () => {
    vi.stubGlobal(
      '$fetch',
      vi.fn(() =>
        Promise.resolve({
          status: 'error',
          errorData: { code: 'FORBIDDEN', reason: 'nope' },
        }),
      ),
    )

    let caught: unknown
    try {
      await executeQueryHttp('https://example.convex.cloud', 'notes:list', {})
    } catch (error) {
      caught = error
    }

    // executeQueryHttp re-throws a ConvexError for the composable to
    // normalize exactly once at its own boundary (per the module doc-comment).
    const normalized = normalizeConvexError(caught)
    expect(normalized.kind).toBe('server')
    expect(normalized.data).toEqual({ code: 'FORBIDDEN', reason: 'nope' })
  })

  it('a 200 envelope with an unstructured error message normalizes to unknown, never guessed from text', async () => {
    vi.stubGlobal(
      '$fetch',
      vi.fn(() =>
        Promise.resolve({
          status: 'error',
          errorMessage: 'ArgumentValidationError: bad args',
        }),
      ),
    )

    let caught: unknown
    try {
      await executeQueryHttp('https://example.convex.cloud', 'notes:list', {})
    } catch (error) {
      caught = error
    }

    const normalized = normalizeConvexError(caught)
    expect(normalized.kind).toBe('unknown')
    expect(normalized.message).toBe('ArgumentValidationError: bad args')
  })
})
