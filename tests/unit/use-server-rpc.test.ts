import { describe, expect, it, vi } from 'vitest'

type ConnectedClient = {
  devtools: {
    extendClientRpc: ReturnType<typeof vi.fn>
  }
}

const onConnectedHandlers: Array<(client: ConnectedClient) => void> = []

vi.mock('@nuxt/devtools-kit/iframe-client', () => ({
  onDevtoolsClientConnected: vi.fn((handler: (client: ConnectedClient) => void) => {
    onConnectedHandlers.push(handler)
  }),
}))

describe('useServerRpc', () => {
  it('does not fetch auth proxy stats until explicitly requested', async () => {
    const rpc = {
      getAuthProxyStats: vi.fn().mockResolvedValue({
        totalRequests: 1,
        successCount: 1,
        errorCount: 0,
        avgDuration: 18,
        recentRequests: [],
      }),
      clearAuthProxyStats: vi.fn().mockResolvedValue(undefined),
    }

    const extendClientRpc = vi.fn(() => rpc)

    const { useServerRpc } = await import('../../apps/devtools-ui/composables/useServerRpc')
    const state = useServerRpc()

    expect(rpc.getAuthProxyStats).not.toHaveBeenCalled()

    for (const handler of onConnectedHandlers) {
      handler({
        devtools: {
          extendClientRpc,
        },
      })
    }

    expect(extendClientRpc).toHaveBeenCalledTimes(1)
    expect(rpc.getAuthProxyStats).not.toHaveBeenCalled()

    await state.fetchStats()

    expect(rpc.getAuthProxyStats).toHaveBeenCalledTimes(1)
    expect(state.proxyStats.value).toEqual({
      totalRequests: 1,
      successCount: 1,
      errorCount: 0,
      avgDuration: 18,
      recentRequests: [],
    })

    await state.clearStats()

    expect(rpc.clearAuthProxyStats).toHaveBeenCalledTimes(1)
    expect(state.proxyStats.value).toBeNull()
  })
})
