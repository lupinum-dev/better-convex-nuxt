import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('#imports', () => ({
  useRuntimeConfig: () => ({ public: { convex: {} } }),
}))

vi.mock('nitropack/runtime', () => ({
  useEvent: () => undefined,
}))

describe('server entrypoint exports', () => {
  let serverApi: typeof import('../../src/runtime/server/index')

  beforeAll(async () => {
    serverApi = await import('../../src/runtime/server/index')
  })

  it('exports hard-cutover server helper names', () => {
    expect(serverApi).toHaveProperty('serverConvexQuery')
    expect(serverApi).toHaveProperty('serverConvexMutation')
    expect(serverApi).toHaveProperty('serverConvexAction')
    expect(serverApi).toHaveProperty('defineConvexMcpTool')
  })

  it('does not expose legacy helper names', () => {
    expect(serverApi).not.toHaveProperty('fetchQuery')
    expect(serverApi).not.toHaveProperty('fetchMutation')
    expect(serverApi).not.toHaveProperty('fetchAction')
  })
})
