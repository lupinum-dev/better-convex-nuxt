import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('#imports', () => ({
  useRuntimeConfig: () => ({ public: { convex: {} } }),
}))

describe('server entrypoint exports', () => {
  let serverApi: typeof import('../../src/runtime/server/index')

  beforeAll(async () => {
    serverApi = await import('../../src/runtime/server/index')
  })

  it('exports the Phase 4 server caller and exchange surface', () => {
    expect(serverApi).toHaveProperty('serverConvex')
    expect(serverApi).toHaveProperty('exchangeConvexToken')
    expect(serverApi).toHaveProperty('normalizeSiteUrl')
    expect(serverApi).not.toHaveProperty('serverConvexClearAuthCache')
  })

  it('does not expose the deleted server trio or legacy helper names', () => {
    expect(serverApi).not.toHaveProperty('serverConvexQuery')
    expect(serverApi).not.toHaveProperty('serverConvexMutation')
    expect(serverApi).not.toHaveProperty('serverConvexAction')
    expect(serverApi).not.toHaveProperty('fetchQuery')
    expect(serverApi).not.toHaveProperty('fetchMutation')
    expect(serverApi).not.toHaveProperty('fetchAction')
  })
})
