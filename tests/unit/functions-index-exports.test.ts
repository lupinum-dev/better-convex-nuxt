import { beforeAll, describe, expect, it } from 'vitest'

describe('functions entrypoint exports', () => {
  let functionsApi: typeof import('../../src/runtime/functions/index')

  beforeAll(async () => {
    functionsApi = await import('../../src/runtime/functions/index')
  })

  it('exports the canonical function builder factory', () => {
    expect(functionsApi).toHaveProperty('defineTrellis')
    expect(functionsApi).not.toHaveProperty('callComponentBridgeRegistrar')
    expect(functionsApi).not.toHaveProperty('createComponentBridge')
    expect(functionsApi).not.toHaveProperty('createApp')
    expect(functionsApi).not.toHaveProperty('createFunctions')
    expect(functionsApi).not.toHaveProperty('defineHandler')
  })
})
