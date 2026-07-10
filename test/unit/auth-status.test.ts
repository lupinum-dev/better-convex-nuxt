import { describe, expect, it } from 'vitest'

import { deriveConvexAuthStatus } from '../../src/runtime/utils/auth-status'
import { getConvexIdentityKey } from '../../src/runtime/utils/identity-key'

const authErr = { kind: 'authentication' as const, message: 'boom' }

describe('deriveConvexAuthStatus (vNext §5.3 precedence: disabled > loading > authenticated > error > anonymous)', () => {
  it('disabled outranks everything, including a settled authenticated-looking input', () => {
    expect(
      deriveConvexAuthStatus({
        authEnabled: false,
        settled: false,
        identityKey: 'user:a',
        error: authErr,
      }),
    ).toBe('disabled')
  })

  it('disabled outranks a settled, error-free, anonymous-looking input', () => {
    expect(
      deriveConvexAuthStatus({
        authEnabled: false,
        settled: true,
        identityKey: 'anonymous',
        error: null,
      }),
    ).toBe('disabled')
  })

  it('disabled ignores settled+identityKey+error entirely (every combination collapses to disabled)', () => {
    for (const settled of [false, true]) {
      for (const identityKey of [null, 'anonymous', 'user:a'] as const) {
        for (const error of [null, authErr]) {
          expect(deriveConvexAuthStatus({ authEnabled: false, settled, identityKey, error })).toBe(
            'disabled',
          )
        }
      }
    }
  })

  it('unsettled enabled auth is loading regardless of identityKey', () => {
    expect(
      deriveConvexAuthStatus({ authEnabled: true, settled: false, identityKey: null, error: null }),
    ).toBe('loading')
  })

  it('unsettled enabled auth is loading even with a stale/pre-settlement identityKey present', () => {
    expect(
      deriveConvexAuthStatus({
        authEnabled: true,
        settled: false,
        identityKey: 'user:a',
        error: null,
      }),
    ).toBe('loading')
  })

  it('unsettled enabled auth is loading even when an error is already recorded', () => {
    expect(
      deriveConvexAuthStatus({
        authEnabled: true,
        settled: false,
        identityKey: null,
        error: authErr,
      }),
    ).toBe('loading')
  })

  it('settled + authenticated key + no error is authenticated', () => {
    expect(
      deriveConvexAuthStatus({
        authEnabled: true,
        settled: true,
        identityKey: 'user:a',
        error: null,
      }),
    ).toBe('authenticated')
  })

  it('authenticated outranks a background error (usable identity retained)', () => {
    expect(
      deriveConvexAuthStatus({
        authEnabled: true,
        settled: true,
        identityKey: 'user:a',
        error: authErr,
      }),
    ).toBe('authenticated')
  })

  it('a second, distinct user key is also authenticated (key identity does not matter to the derivation)', () => {
    expect(
      deriveConvexAuthStatus({
        authEnabled: true,
        settled: true,
        identityKey: 'user:b',
        error: null,
      }),
    ).toBe('authenticated')
  })

  it('error outranks anonymous when initial resolution failed', () => {
    expect(
      deriveConvexAuthStatus({
        authEnabled: true,
        settled: true,
        identityKey: 'anonymous',
        error: authErr,
      }),
    ).toBe('error')
  })

  it('error outranks a null identityKey (settled without a resolved key) too', () => {
    expect(
      deriveConvexAuthStatus({
        authEnabled: true,
        settled: true,
        identityKey: null,
        error: authErr,
      }),
    ).toBe('error')
  })

  it('settled anonymous without error is anonymous', () => {
    expect(
      deriveConvexAuthStatus({
        authEnabled: true,
        settled: true,
        identityKey: 'anonymous',
        error: null,
      }),
    ).toBe('anonymous')
  })

  it('settled with a null identityKey and no error is anonymous (not authenticated, not error)', () => {
    expect(
      deriveConvexAuthStatus({
        authEnabled: true,
        settled: true,
        identityKey: null,
        error: null,
      }),
    ).toBe('anonymous')
  })
})

describe('deriveConvexAuthStatus — full two-dimensional matrix (vNext §5.3)', () => {
  // `status` (5 outcomes) is a pure function of the two independent inputs
  // `authEnabled` and the (settled, identityKey, error) triple; `isPending` is
  // NOT one of the derivation inputs — it is the orthogonal second dimension of
  // `UseConvexAuthReturn` and is deliberately absent from `ConvexAuthStatusInput`
  // (vNext §5.3: "isPending describes auth work in flight... independent").
  const identityKeys = [null, 'anonymous', 'user:a'] as const
  const errors = [null, authErr] as const

  it('authEnabled:false always yields disabled, independent of every other input', () => {
    for (const settled of [false, true]) {
      for (const identityKey of identityKeys) {
        for (const error of errors) {
          expect(deriveConvexAuthStatus({ authEnabled: false, settled, identityKey, error })).toBe(
            'disabled',
          )
        }
      }
    }
  })

  it('authEnabled:true, settled:false always yields loading, independent of identityKey/error', () => {
    for (const identityKey of identityKeys) {
      for (const error of errors) {
        expect(
          deriveConvexAuthStatus({ authEnabled: true, settled: false, identityKey, error }),
        ).toBe('loading')
      }
    }
  })

  it('authEnabled:true, settled:true, authenticated identityKey always yields authenticated, independent of error', () => {
    for (const error of errors) {
      expect(
        deriveConvexAuthStatus({
          authEnabled: true,
          settled: true,
          identityKey: 'user:a',
          error,
        }),
      ).toBe('authenticated')
    }
  })

  it('authEnabled:true, settled:true, non-authenticated identityKey (null or anonymous) yields error when an error is present', () => {
    for (const identityKey of [null, 'anonymous'] as const) {
      expect(
        deriveConvexAuthStatus({ authEnabled: true, settled: true, identityKey, error: authErr }),
      ).toBe('error')
    }
  })

  it('authEnabled:true, settled:true, non-authenticated identityKey (null or anonymous) yields anonymous when no error', () => {
    for (const identityKey of [null, 'anonymous'] as const) {
      expect(
        deriveConvexAuthStatus({ authEnabled: true, settled: true, identityKey, error: null }),
      ).toBe('anonymous')
    }
  })
})

describe('getConvexIdentityKey (vNext §5.4)', () => {
  it('maps null user to anonymous', () => {
    expect(getConvexIdentityKey(null)).toBe('anonymous')
  })

  it('maps a user id to user:<id>', () => {
    expect(getConvexIdentityKey({ id: 'abc' })).toBe('user:abc')
  })

  it('throws on a user with a missing/empty id (never user:undefined)', () => {
    expect(() => getConvexIdentityKey({ id: '' })).toThrow(TypeError)
    // @ts-expect-error id is required
    expect(() => getConvexIdentityKey({ name: 'x' })).toThrow(TypeError)
  })
})
