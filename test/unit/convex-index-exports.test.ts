import { beforeAll, describe, expect, it } from 'vitest'

describe('convex entrypoint exports', () => {
  let convexApi: typeof import('../../src/runtime/convex/index')

  beforeAll(async () => {
    convexApi = await import('../../src/runtime/convex/index')
  })

  it('exports the typed V2 backend helpers', () => {
    expect(convexApi).toHaveProperty('createFunctions')
    expect(convexApi).toHaveProperty('defineActorConfig')
    expect(convexApi).toHaveProperty('definePermissions')
  })
})
