import { describe, expect, it } from 'vitest'

import {
  ServerConvexValidationError,
  credentialHasControlChars,
  validateServerConvexOptions,
} from '../../src/runtime/server/utils/server-convex-options'

describe('validateServerConvexOptions — cookie-based defaults', () => {
  it('defaults an omitted auth to a fixed optional', () => {
    expect(validateServerConvexOptions()).toEqual({ auth: 'optional' })
    expect(validateServerConvexOptions({})).toEqual({ auth: 'optional' })
  })

  it('preserves an explicit cookie-based auth mode', () => {
    expect(validateServerConvexOptions({ auth: 'required' })).toEqual({ auth: 'required' })
    expect(validateServerConvexOptions({ auth: 'optional' })).toEqual({ auth: 'optional' })
    expect(validateServerConvexOptions({ auth: 'none' })).toEqual({ auth: 'none' })
  })
})

describe('validateServerConvexOptions — explicit principal forces required', () => {
  it('forces an omitted auth to required when authToken is provided', () => {
    expect(validateServerConvexOptions({ authToken: 'jwt' })).toEqual({
      auth: 'required',
      authToken: 'jwt',
    })
  })

  it('forces an omitted auth to required when credential is provided', () => {
    expect(validateServerConvexOptions({ credential: { type: 'cookie', value: 'c=1' } })).toEqual({
      auth: 'required',
      credential: { type: 'cookie', value: 'c=1' },
    })
  })

  it('allows an explicit principal combined with an explicit required', () => {
    expect(validateServerConvexOptions({ auth: 'required', authToken: 'jwt' })).toEqual({
      auth: 'required',
      authToken: 'jwt',
    })
    expect(
      validateServerConvexOptions({
        auth: 'required',
        credential: { type: 'bearer', value: 'b' },
      }),
    ).toEqual({ auth: 'required', credential: { type: 'bearer', value: 'b' } })
  })
})

describe('validateServerConvexOptions — rejected combinations', () => {
  it('rejects authToken and credential together (mutually exclusive)', () => {
    expect(() =>
      validateServerConvexOptions({ authToken: 'jwt', credential: { type: 'cookie', value: 'c' } }),
    ).toThrow(ServerConvexValidationError)
  })

  it('rejects an explicit authToken combined with optional (no silent downgrade)', () => {
    expect(() => validateServerConvexOptions({ auth: 'optional', authToken: 'jwt' })).toThrow(
      ServerConvexValidationError,
    )
  })

  it('rejects an explicit authToken combined with none', () => {
    expect(() => validateServerConvexOptions({ auth: 'none', authToken: 'jwt' })).toThrow(
      ServerConvexValidationError,
    )
  })

  it('rejects an explicit credential combined with optional', () => {
    expect(() =>
      validateServerConvexOptions({ auth: 'optional', credential: { type: 'cookie', value: 'c' } }),
    ).toThrow(ServerConvexValidationError)
  })

  it('rejects an explicit credential combined with none', () => {
    expect(() =>
      validateServerConvexOptions({ auth: 'none', credential: { type: 'bearer', value: 'b' } }),
    ).toThrow(ServerConvexValidationError)
  })
})

describe('validateServerConvexOptions — empty and control-character values', () => {
  it('rejects an empty authToken', () => {
    expect(() => validateServerConvexOptions({ authToken: '' })).toThrow(
      ServerConvexValidationError,
    )
  })

  it('rejects an empty credential value', () => {
    expect(() =>
      validateServerConvexOptions({ credential: { type: 'cookie', value: '' } }),
    ).toThrow(ServerConvexValidationError)
  })

  it('rejects a control-character authToken (CRLF)', () => {
    expect(() =>
      validateServerConvexOptions({ authToken: `jwt${String.fromCharCode(13, 10)}x` }),
    ).toThrow(ServerConvexValidationError)
  })

  it('rejects a control-character credential value (bare LF)', () => {
    expect(() =>
      validateServerConvexOptions({
        credential: { type: 'cookie', value: `c=1${String.fromCharCode(10)}evil` },
      }),
    ).toThrow(ServerConvexValidationError)
  })

  it('rejects a malformed credential shape', () => {
    expect(() =>
      // @ts-expect-error deliberately invalid credential type
      validateServerConvexOptions({ credential: { type: 'basic', value: 'x' } }),
    ).toThrow(ServerConvexValidationError)
  })
})

describe('credentialHasControlChars', () => {
  it('detects CR, LF, NUL, DEL, TAB and other control chars', () => {
    for (const code of [0, 9, 10, 13, 31, 127]) {
      expect(credentialHasControlChars(`a${String.fromCharCode(code)}b`)).toBe(true)
    }
  })
  it('returns false for a clean printable value', () => {
    expect(credentialHasControlChars('better-auth.session_token=abc123; Path=/')).toBe(false)
  })
})
