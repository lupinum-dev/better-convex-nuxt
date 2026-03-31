import { beforeAll, describe, expect, it } from 'vitest'

describe('auth entrypoint exports', () => {
  let authApi: typeof import('../../src/runtime/auth/index')

  beforeAll(async () => {
    authApi = await import('../../src/runtime/auth/index')
  })

  it('exports the v4 auth primitives', () => {
    expect(authApi).toHaveProperty('and')
    expect(authApi).toHaveProperty('or')
    expect(authApi).toHaveProperty('not')
    expect(authApi).toHaveProperty('all')
    expect(authApi).toHaveProperty('any')
    expect(authApi).toHaveProperty('authorize')
    expect(authApi).toHaveProperty('can')
    expect(authApi).toHaveProperty('deny')
    expect(authApi).toHaveProperty('getAuth')
    expect(authApi).toHaveProperty('requireAuth')
    expect(authApi).toHaveProperty('requireRecord')
    expect(authApi).toHaveProperty('verifyKey')
    expect(authApi).toHaveProperty('defineVisibility')
    expect(authApi).toHaveProperty('applyVisibility')
  })
})
