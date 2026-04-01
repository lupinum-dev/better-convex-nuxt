import { beforeAll, describe, expect, it } from 'vitest'

describe('auth entrypoint exports', () => {
  let authApi: typeof import('../../src/runtime/auth/index')
  let trustedCallerApi: typeof import('../../src/runtime/trusted-caller/index')
  let visibilityApi: typeof import('../../src/runtime/visibility/index')

  beforeAll(async () => {
    authApi = await import('../../src/runtime/auth/index')
    trustedCallerApi = await import('../../src/runtime/trusted-caller/index')
    visibilityApi = await import('../../src/runtime/visibility/index')
  })

  it('exports the v3 auth primitives and split optional layers', () => {
    expect(authApi).toHaveProperty('and')
    expect(authApi).toHaveProperty('or')
    expect(authApi).toHaveProperty('authorize')
    expect(authApi).toHaveProperty('can')
    expect(authApi).toHaveProperty('deny')
    expect(authApi).toHaveProperty('getAuth')
    expect(authApi).toHaveProperty('requireAuth')
    expect(authApi).toHaveProperty('requireRecord')

    expect(trustedCallerApi).toHaveProperty('getTrustedCaller')
    expect(trustedCallerApi).toHaveProperty('verifyTrustedCallerKey')
    expect(trustedCallerApi).toHaveProperty('withTrustedCaller')

    expect(visibilityApi).toHaveProperty('defineVisibility')
    expect(visibilityApi).toHaveProperty('applyVisibility')
    expect(visibilityApi).toHaveProperty('getVisibilityQuery')
  })
})
