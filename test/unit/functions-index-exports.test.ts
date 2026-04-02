import { beforeAll, describe, expect, it } from 'vitest'

describe('functions entrypoint exports', () => {
  let functionsApi: typeof import('../../src/runtime/functions/index')

  beforeAll(async () => {
    functionsApi = await import('../../src/runtime/functions/index')
  })

  it('exports the canonical function builder factory', () => {
    expect(functionsApi).toHaveProperty('createFunctions')
    expect(functionsApi).toHaveProperty('defineHandler')
    expect(functionsApi).toHaveProperty('open')
  })
})
