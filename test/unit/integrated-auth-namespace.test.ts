import { describe, expect, it, vi } from 'vitest'

import {
  createIntegratedAuthNamespace,
  getSessionSynchronizationToken,
  isPlainNamespaceObject,
} from '../../src/runtime/auth/integrated-namespace'

describe('getSessionSynchronizationToken', () => {
  it('returns only a non-empty string data.token', () => {
    expect(getSessionSynchronizationToken({ data: { token: 'session-token' }, error: null })).toBe(
      'session-token',
    )
  })
  it('returns null on an error envelope', () => {
    expect(
      getSessionSynchronizationToken({
        data: { token: 'session-token' },
        error: { message: 'x' },
      }),
    ).toBeNull()
  })
  it('returns null when token is null (account creation without a session)', () => {
    expect(getSessionSynchronizationToken({ data: { token: null }, error: null })).toBeNull()
  })
  it('returns null for a social redirect result (no token)', () => {
    expect(
      getSessionSynchronizationToken({
        data: { url: 'https://idp', redirect: true },
        error: null,
      }),
    ).toBeNull()
  })
  it('returns null for an empty token or non-object result', () => {
    expect(getSessionSynchronizationToken({ data: { token: '' }, error: null })).toBeNull()
    expect(getSessionSynchronizationToken(undefined)).toBeNull()
    expect(getSessionSynchronizationToken('nope')).toBeNull()
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

describe('createIntegratedAuthNamespace ', () => {
  function makeNamespace() {
    const wait = vi.fn(async (_sessionToken: string | null) => {})
    const cancel = vi.fn()
    const createBarrier = vi.fn(() => ({ wait, cancel }))
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
    return { namespace, createBarrier, wait, cancel }
  }

  it('waits after email success and cancels after failure/sign-up-null', async () => {
    const { namespace, createBarrier, wait, cancel } = makeNamespace()
    const integrated = createIntegratedAuthNamespace(namespace, createBarrier)

    await integrated.email()
    expect(wait).toHaveBeenCalledTimes(1)
    expect(wait).toHaveBeenCalledWith('jwt-email')

    await integrated.failing()
    await integrated.signUp()
    expect(createBarrier).toHaveBeenCalledTimes(3)
    expect(wait).toHaveBeenCalledTimes(1)
    expect(cancel).toHaveBeenCalledTimes(2)
  })

  it('keeps a token-bearing operation pending until the session observer barrier resolves', async () => {
    let release!: () => void
    const barrier = new Promise<void>((resolve) => {
      release = resolve
    })
    const namespace = {
      email: async () => ({ data: { token: 'jwt-email' }, error: null }),
    }
    const wait = vi.fn((_sessionToken: string | null) => barrier)
    const integrated = createIntegratedAuthNamespace(namespace, () => ({
      wait,
      cancel: vi.fn(),
    }))
    let completed = false

    const operation = integrated.email().then(() => {
      completed = true
    })
    await Promise.resolve()
    await Promise.resolve()

    expect(completed).toBe(false)
    expect(wait).toHaveBeenCalledWith('jwt-email')
    release()
    await operation
    expect(completed).toBe(true)
  })

  it('captures the barrier before invoking an action that signals early', async () => {
    const events: string[] = []
    let observe!: () => void
    const observed = new Promise<void>((resolve) => {
      observe = resolve
    })
    const namespace = {
      email: async () => {
        events.push('action')
        observe()
        return { data: { token: 'jwt-email' }, error: null }
      },
    }
    const integrated = createIntegratedAuthNamespace(namespace, () => {
      events.push('capture')
      return {
        wait: (sessionToken: string | null) => {
          events.push(`wait:${sessionToken}`)
          return observed
        },
        cancel: vi.fn(),
      }
    })

    await integrated.email()

    expect(events).toEqual(['capture', 'action', 'wait:jwt-email'])
  })

  it('cancels the captured barrier when an action throws', async () => {
    const cancel = vi.fn()
    const integrated = createIntegratedAuthNamespace(
      {
        email: async () => {
          throw new Error('network down')
        },
      },
      () => ({ wait: vi.fn(async () => {}), cancel }),
    )

    await expect(integrated.email()).rejects.toThrow('network down')
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('does not wait on a social redirect but waits on a token-bearing completion', async () => {
    const { namespace, createBarrier, wait, cancel } = makeNamespace()
    const integrated = createIntegratedAuthNamespace(namespace, createBarrier)

    await integrated.social({})
    await integrated.social({ disableRedirect: true })
    expect(wait).toHaveBeenCalledTimes(0)
    expect(cancel).toHaveBeenCalledTimes(2)

    await integrated.completeSocial()
    expect(wait).toHaveBeenCalledTimes(1)
    expect(wait).toHaveBeenCalledWith('jwt-social')
  })

  it('preserves the receiver for nested plugin methods', async () => {
    const { namespace, createBarrier, wait } = makeNamespace()
    const integrated = createIntegratedAuthNamespace(namespace, createBarrier)

    // Destructured through the proxy: `this` must still be the org namespace.
    const result = await integrated.organization.create()
    expect(result.error).toBeNull()
    expect(wait).toHaveBeenCalledTimes(1)
    expect(wait).toHaveBeenCalledWith('jwt-org')
  })

  it('is referentially stable across repeated reads', () => {
    const { namespace, createBarrier } = makeNamespace()
    const integrated = createIntegratedAuthNamespace(namespace, createBarrier)

    expect(integrated.email).toBe(integrated.email)
    expect(integrated.organization).toBe(integrated.organization)
    expect(integrated.organization.create).toBe(integrated.organization.create)
  })

  it('passes arrays and non-namespace values through unchanged', () => {
    const { namespace, createBarrier } = makeNamespace()
    const integrated = createIntegratedAuthNamespace(namespace, createBarrier)
    expect(integrated.subscriptionAtom).toBe(namespace.subscriptionAtom)
    expect(integrated.secret).toBe('convex')
  })
})
