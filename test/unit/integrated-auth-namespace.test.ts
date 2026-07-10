import { describe, expect, it, vi } from 'vitest'

import {
  createIntegratedAuthNamespace,
  isPlainNamespaceObject,
  readBetterAuthResultError,
  shouldSynchronizeAfterAuthResult,
} from '../../src/runtime/auth/integrated-namespace'

describe('shouldSynchronizeAfterAuthResult (vNext §8 predicate)', () => {
  it('syncs only after a non-empty string data.token', () => {
    expect(shouldSynchronizeAfterAuthResult({ data: { token: 'jwt' }, error: null })).toBe(true)
  })
  it('does not sync on an error envelope', () => {
    expect(
      shouldSynchronizeAfterAuthResult({ data: { token: 'jwt' }, error: { message: 'x' } }),
    ).toBe(false)
  })
  it('does not sync when token is null (account creation without a session)', () => {
    expect(shouldSynchronizeAfterAuthResult({ data: { token: null }, error: null })).toBe(false)
  })
  it('does not sync on a social redirect result (no token)', () => {
    expect(
      shouldSynchronizeAfterAuthResult({
        data: { url: 'https://idp', redirect: true },
        error: null,
      }),
    ).toBe(false)
  })
  it('does not sync on empty token or non-object results', () => {
    expect(shouldSynchronizeAfterAuthResult({ data: { token: '' }, error: null })).toBe(false)
    expect(shouldSynchronizeAfterAuthResult(undefined)).toBe(false)
    expect(shouldSynchronizeAfterAuthResult('nope')).toBe(false)
  })
})

describe('readBetterAuthResultError', () => {
  it('returns a truthy error, else null', () => {
    expect(readBetterAuthResultError({ error: { message: 'x' } })).toEqual({ message: 'x' })
    expect(readBetterAuthResultError({ error: null })).toBeNull()
    expect(readBetterAuthResultError({})).toBeNull()
    expect(readBetterAuthResultError(null)).toBeNull()
  })
})

describe('isPlainNamespaceObject', () => {
  it('accepts plain and null-prototype objects', () => {
    expect(isPlainNamespaceObject({})).toBe(true)
    expect(isPlainNamespaceObject(Object.create(null))).toBe(true)
  })
  it('rejects arrays, class instances, and non-objects', () => {
    class Store {
      id = 1
    }
    expect(isPlainNamespaceObject([])).toBe(false)
    expect(isPlainNamespaceObject(new Store())).toBe(false)
    expect(isPlainNamespaceObject(() => {})).toBe(false)
    expect(isPlainNamespaceObject(null)).toBe(false)
  })
})

describe('createIntegratedAuthNamespace (vNext §8)', () => {
  function makeNamespace() {
    const sync = vi.fn(async () => {})
    // A nested plugin method that reads its receiver; loses it if `this` is not
    // the containing object.
    const namespace = {
      secret: 'convex',
      email: async () => ({ data: { token: 'jwt-email' }, error: null }),
      social: async (input: { disableRedirect?: boolean }) =>
        input.disableRedirect
          ? { data: { url: null, redirect: false }, error: null }
          : { data: { url: 'https://idp', redirect: true }, error: null },
      completeSocial: async () => ({ data: { token: 'jwt-social' }, error: null }),
      failing: async () => ({ data: null, error: { message: 'bad credentials' } }),
      signUp: async () => ({ data: { token: null, user: { id: 'u1' } }, error: null }),
      organization: {
        id: 'org',
        create: async function (this: { id: string }) {
          // Fails if the receiver is lost (proves apply-with-receiver).
          if (this?.id !== 'org') throw new Error('receiver lost')
          return { data: { token: 'jwt-org' }, error: null }
        },
      },
      subscriptionAtom: [1, 2, 3],
    }
    return { namespace, sync }
  }

  it('syncs after email success and not after failure/sign-up-null', async () => {
    const { namespace, sync } = makeNamespace()
    const integrated = createIntegratedAuthNamespace(namespace, sync)

    await integrated.email()
    expect(sync).toHaveBeenCalledTimes(1)

    await integrated.failing()
    await integrated.signUp()
    expect(sync).toHaveBeenCalledTimes(1)
  })

  it('does not sync a social redirect but syncs a token-bearing completion', async () => {
    const { namespace, sync } = makeNamespace()
    const integrated = createIntegratedAuthNamespace(namespace, sync)

    await integrated.social({})
    await integrated.social({ disableRedirect: true })
    expect(sync).toHaveBeenCalledTimes(0)

    await integrated.completeSocial()
    expect(sync).toHaveBeenCalledTimes(1)
  })

  it('preserves the receiver for nested plugin methods', async () => {
    const { namespace, sync } = makeNamespace()
    const integrated = createIntegratedAuthNamespace(namespace, sync)

    // Destructured through the proxy: `this` must still be the org namespace.
    const result = await integrated.organization.create()
    expect(result.error).toBeNull()
    expect(sync).toHaveBeenCalledTimes(1)
  })

  it('is referentially stable across repeated reads', () => {
    const { namespace, sync } = makeNamespace()
    const integrated = createIntegratedAuthNamespace(namespace, sync)

    expect(integrated.email).toBe(integrated.email)
    expect(integrated.organization).toBe(integrated.organization)
    expect(integrated.organization.create).toBe(integrated.organization.create)
  })

  it('passes arrays and non-namespace values through unchanged', () => {
    const { namespace, sync } = makeNamespace()
    const integrated = createIntegratedAuthNamespace(namespace, sync)
    expect(integrated.subscriptionAtom).toBe(namespace.subscriptionAtom)
    expect(integrated.secret).toBe('convex')
  })
})
