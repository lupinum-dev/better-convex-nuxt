import { beforeAll, describe, expect, it } from 'vitest'

describe('schema entrypoint exports', () => {
  let schemaApi: typeof import('../../src/runtime/schema/index')

  beforeAll(async () => {
    schemaApi = await import('../../src/runtime/schema/index')
  })

  it('exports the server-safe shared-schema helpers', () => {
    expect(schemaApi).toHaveProperty('defineConvexSchema')
    expect(schemaApi).toHaveProperty('toConvexSchema')
    expect(schemaApi).toHaveProperty('useConvexSchema')
  })
})
