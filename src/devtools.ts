import { existsSync } from 'node:fs'

import {
  addCustomTab,
  extendServerRpc,
  onDevToolsInitialized,
  startSubprocess,
} from '@nuxt/devtools-kit'
import { createResolver, extendViteConfig } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import { joinURL } from 'ufo'

import {
  DEVTOOLS_UI_PATH,
  DEVTOOLS_UI_PORT,
  DEVTOOLS_RPC_NAMESPACE,
} from './runtime/devtools/constants'
import { resolveNuxtCliArgs } from './devtools/nuxt-cli'
import type { ServerRpcFunctions, ClientRpcFunctions } from './runtime/devtools/types'

export function setupConvexDevtools(nuxt: Nuxt): void {
  const resolver = createResolver(import.meta.url)
  const clientPath = resolver.resolve('./client')
  const isProductionBuild = existsSync(clientPath)

  if (isProductionBuild) {
    nuxt.hook('vite:serverCreated', async (server) => {
      const sirv = await import('sirv').then((r) => r.default || r)
      server.middlewares.use(DEVTOOLS_UI_PATH, sirv(clientPath, { dev: true, single: true }))
    })
  } else {
    // Dev mode: proxy to client dev server subprocess
    extendViteConfig((config) => {
      config.server = config.server || {}
      config.server.proxy = config.server.proxy || {}
      config.server.proxy[DEVTOOLS_UI_PATH] = {
        target: `http://localhost:${DEVTOOLS_UI_PORT}${DEVTOOLS_UI_PATH}`,
        changeOrigin: true,
        followRedirects: true,
        ws: true,
        rewrite: (path) => path.replace(DEVTOOLS_UI_PATH, ''),
      }
    })

    nuxt.hook('app:resolve', () => {
      startSubprocess(
        {
          ...resolveNuxtCliArgs(import.meta.url, 'dev', ['--port', DEVTOOLS_UI_PORT.toString()]),
          cwd: resolver.resolve('../client'),
          stdio: 'pipe',
          env: {
            PORT: DEVTOOLS_UI_PORT.toString(),
          },
        },
        {
          id: 'nuxt-devtools:convex-client',
          name: 'Convex DevTools Client Dev',
        },
        nuxt,
      )
    })
  }

  addCustomTab({
    name: 'convex',
    title: 'Convex',
    icon: 'carbon:data-connected',
    category: 'app',
    view: {
      type: 'iframe',
      src: joinURL(nuxt.options.app?.baseURL || '/', DEVTOOLS_UI_PATH),
      persistent: true,
    },
  })

  onDevToolsInitialized(async () => {
    extendServerRpc<ClientRpcFunctions, ServerRpcFunctions>(DEVTOOLS_RPC_NAMESPACE, {
      async getAuthProxyStats() {
        try {
          const { getAuthProxyStats } = await import('./runtime/devtools/auth-proxy-registry')
          return await getAuthProxyStats()
        } catch {
          return null
        }
      },
      async clearAuthProxyStats() {
        try {
          const { clearAuthProxyStats } = await import('./runtime/devtools/auth-proxy-registry')
          await clearAuthProxyStats()
        } catch {
          // Best-effort diagnostics only.
        }
      },
    })
  })
}
