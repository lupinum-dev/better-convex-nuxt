import { beforeAll, describe, expect, it } from 'vitest'

describe('feature entrypoint exports', () => {
  let featureApi: typeof import('../../src/runtime/feature/index')

  beforeAll(async () => {
    featureApi = await import('../../src/runtime/feature/index')
  })

  it('exports the feature composition helpers', () => {
    expect(featureApi).toHaveProperty('defineFeature')
    expect(featureApi).toHaveProperty('composeFeatures')
  })
})
