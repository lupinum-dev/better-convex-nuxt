import { onDevtoolsClientConnected } from '@nuxt/devtools-kit/iframe-client'
import { ref } from 'vue'

import { DEVTOOLS_RPC_NAMESPACE } from '../../../src/runtime/devtools/constants'
import type {
  ServerRpcFunctions,
  ClientRpcFunctions,
  AuthProxyStats,
} from '../../../src/runtime/devtools/types'

export function useServerRpc() {
  let rpc: ServerRpcFunctions | null = null
  const proxyStats = ref<AuthProxyStats | null>(null)
  const isLoading = ref(false)

  onDevtoolsClientConnected((client) => {
    rpc = client.devtools.extendClientRpc<ServerRpcFunctions, ClientRpcFunctions>(
      DEVTOOLS_RPC_NAMESPACE,
      {},
    )
  })

  async function fetchStats() {
    if (!rpc) return
    isLoading.value = true
    try {
      proxyStats.value = await rpc.getAuthProxyStats()
    } catch {
      proxyStats.value = null
    } finally {
      isLoading.value = false
    }
  }

  async function clearStats() {
    if (!rpc) return
    await rpc.clearAuthProxyStats()
    proxyStats.value = null
  }

  return {
    proxyStats,
    isLoading,
    fetchStats,
    clearStats,
  }
}
