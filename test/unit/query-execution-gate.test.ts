import { describe, expect, it } from 'vitest'

import type { ConvexAuthMode, ConvexAuthStatus } from '../../src/runtime/utils/auth-status'
import type { ConvexIdentityKey } from '../../src/runtime/utils/identity-key'
import {
  createQueryExecutionGate,
  type QueryExecutionGateInput,
} from '../../src/runtime/utils/query-execution-gate'

const USER: ConvexIdentityKey = 'user:alice'

function gate(overrides: Partial<QueryExecutionGateInput> = {}) {
  const base: QueryExecutionGateInput = {
    authStatus: 'authenticated',
    authMode: 'optional',
    identityKey: USER,
    skipped: false,
    subscribe: true,
  }
  return createQueryExecutionGate({ ...base, ...overrides })
}

const MODES: ConvexAuthMode[] = ['required', 'optional', 'none']
const STATUSES: ConvexAuthStatus[] = ['disabled', 'loading', 'anonymous', 'authenticated', 'error']

describe('createQueryExecutionGate', () => {
  // 1. Explicit skip resolves idle regardless of status/mode.
  describe('step 1 — explicit skip', () => {
    for (const authStatus of STATUSES) {
      for (const authMode of MODES) {
        it(`skip idles for ${authMode}/${authStatus}`, () => {
          const g = gate({ skipped: true, authStatus, authMode })
          expect(g).toMatchObject({
            outcome: 'idle',
            reason: 'explicit-skip',
          })
        })
      }
    }
  })

  // 2. `none` executes without waiting, anonymous cache dimension, anonymous
  //    transport (except in an auth-disabled build where the primary is already
  //    anonymous).
  describe('step 2 — none executes anonymously without waiting', () => {
    for (const authStatus of STATUSES) {
      it(`none executes for status ${authStatus}`, () => {
        const g = gate({ authMode: 'none', authStatus, identityKey: USER })
        expect(g).toMatchObject({
          outcome: 'execute',
          subscribe: true,
          cacheIdentity: 'anonymous',
          reason: 'executing',
        })
        expect(g.outcome).toBe('execute')
        if (g.outcome !== 'execute') throw new Error('none must execute')
        // Uses the dedicated anonymous client only when auth is enabled.
        expect(g.useAnonymousClient).toBe(authStatus !== 'disabled')
      })
    }

    it('none respects subscribe=false (no live subscription)', () => {
      expect(gate({ authMode: 'none', subscribe: false })).toMatchObject({
        outcome: 'execute',
        subscribe: false,
      })
      expect(gate({ authMode: 'none', subscribe: true })).toMatchObject({
        outcome: 'execute',
        subscribe: true,
      })
    })

    it('none never inspects identity — authenticated key still keys anonymous', () => {
      expect(
        gate({
          authMode: 'none',
          authStatus: 'authenticated',
          identityKey: USER,
        }),
      ).toMatchObject({ cacheIdentity: 'anonymous', outcome: 'execute' })
    })
  })

  // 3. Auth disabled.
  describe('step 3 — disabled', () => {
    it('required idles under disabled', () => {
      expect(
        gate({
          authStatus: 'disabled',
          authMode: 'required',
          identityKey: null,
        }),
      ).toMatchObject({
        outcome: 'idle',
        cacheIdentity: 'anonymous',
        reason: 'required-idle',
      })
    })

    it('optional executes anonymously without waiting under disabled', () => {
      expect(
        gate({
          authStatus: 'disabled',
          authMode: 'optional',
          identityKey: null,
        }),
      ).toMatchObject({
        outcome: 'execute',
        useAnonymousClient: false,
        cacheIdentity: 'anonymous',
        reason: 'executing',
      })
    })
  })

  // 4. Loading — both wait.
  describe('step 4 — loading waits', () => {
    for (const authMode of ['required', 'optional'] as const) {
      it(`${authMode} waits under loading`, () => {
        expect(gate({ authStatus: 'loading', authMode, identityKey: null })).toMatchObject({
          outcome: 'wait',
          reason: 'auth-loading',
        })
      })
    }
  })

  // 5. Error — surface without a network request; never downgrade to anonymous.
  describe('step 5 — error surfaces without a request', () => {
    for (const authMode of ['required', 'optional'] as const) {
      it(`${authMode} surfaces auth error`, () => {
        expect(gate({ authStatus: 'error', authMode, identityKey: null })).toMatchObject({
          outcome: 'error',
          reason: 'auth-error',
        })
      })
    }
  })

  // 6. Anonymous — required idles, optional executes anonymously.
  describe('step 6 — settled anonymous', () => {
    it('required idles under anonymous', () => {
      expect(
        gate({
          authStatus: 'anonymous',
          authMode: 'required',
          identityKey: 'anonymous',
        }),
      ).toMatchObject({
        outcome: 'idle',
        cacheIdentity: 'anonymous',
        reason: 'required-idle',
      })
    })

    it('optional executes anonymously under anonymous', () => {
      expect(
        gate({
          authStatus: 'anonymous',
          authMode: 'optional',
          identityKey: 'anonymous',
        }),
      ).toMatchObject({
        outcome: 'execute',
        cacheIdentity: 'anonymous',
        useAnonymousClient: false,
        reason: 'executing',
      })
    })
  })

  // 7. Authenticated — both execute with the concrete user identity.
  describe('step 7 — authenticated', () => {
    for (const authMode of ['required', 'optional'] as const) {
      it(`${authMode} executes with the user identity`, () => {
        expect(gate({ authStatus: 'authenticated', authMode, identityKey: USER })).toMatchObject({
          outcome: 'execute',
          subscribe: true,
          useAnonymousClient: false,
          cacheIdentity: USER,
          reason: 'executing',
        })
      })
    }

    it('subscribe=false suppresses the live subscription while still executing', () => {
      expect(
        gate({
          authStatus: 'authenticated',
          authMode: 'optional',
          subscribe: false,
        }),
      ).toMatchObject({ outcome: 'execute', subscribe: false })
    })

    it('defensively waits when authenticated but the identity key is not a concrete user', () => {
      // Never manufacture user:undefined (vNext §5.4). A settled-authenticated
      // status without a usable id waits rather than executing.
      expect(
        gate({
          authStatus: 'authenticated',
          authMode: 'required',
          identityKey: null,
        }),
      ).toMatchObject({
        outcome: 'wait',
        cacheIdentity: 'anonymous',
        reason: 'auth-loading',
      })
      expect(
        gate({
          authStatus: 'authenticated',
          authMode: 'optional',
          identityKey: 'anonymous',
        }),
      ).toMatchObject({
        outcome: 'wait',
      })
    })
  })

  // Precedence: skip beats everything, including none/loading/error.
  describe('precedence', () => {
    it('skip beats none', () => {
      expect(gate({ skipped: true, authMode: 'none' }).reason).toBe('explicit-skip')
    })

    it('none beats loading (does not wait for auth)', () => {
      expect(gate({ authMode: 'none', authStatus: 'loading' })).toMatchObject({
        outcome: 'execute',
      })
    })

    it('none beats error (does not surface auth error)', () => {
      expect(gate({ authMode: 'none', authStatus: 'error' })).toMatchObject({
        outcome: 'execute',
      })
    })
  })

  // Execution-only transport fields are structurally absent otherwise.
  it('only execute decisions carry transport fields', () => {
    for (const authStatus of STATUSES) {
      for (const authMode of MODES) {
        const g = gate({
          authStatus,
          authMode,
          subscribe: true,
          identityKey: USER,
        })
        if (g.outcome !== 'execute') {
          expect('subscribe' in g).toBe(false)
          expect('useAnonymousClient' in g).toBe(false)
        }
      }
    }
  })
})
