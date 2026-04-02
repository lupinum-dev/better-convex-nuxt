import { beforeAll, describe, expect, it } from 'vitest'

describe('visibility entrypoint exports', () => {
  let visibilityApi: typeof import('../../src/runtime/visibility/index')

  beforeAll(async () => {
    visibilityApi = await import('../../src/runtime/visibility/index')
  })

  it('exports visibility, capabilities, and redaction primitives', () => {
    expect(visibilityApi).toHaveProperty('defineVisibility')
    expect(visibilityApi).toHaveProperty('applyVisibility')
    expect(visibilityApi).toHaveProperty('getVisibilityQuery')
    expect(visibilityApi).toHaveProperty('defineCapabilities')
    expect(visibilityApi).toHaveProperty('defineRedaction')
  })
})
