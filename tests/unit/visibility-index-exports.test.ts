import { beforeAll, describe, expect, it } from 'vitest'

describe('visibility entrypoint exports', () => {
  let visibilityApi: typeof import('../../src/runtime/visibility/index')

  beforeAll(async () => {
    visibilityApi = await import('../../src/runtime/visibility/index')
  })

  it('exports recordAccess and redaction primitives', () => {
    expect(visibilityApi).toHaveProperty('defineRecordAccess')
    expect(visibilityApi).toHaveProperty('defineRedaction')
  })
})
