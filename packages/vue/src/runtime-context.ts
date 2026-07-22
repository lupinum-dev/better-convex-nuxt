import { ConvexClient } from 'convex/browser'
import type { App, InjectionKey, Plugin } from 'vue'
import { inject, readonly, shallowRef } from 'vue'

import { attachClientIdentity, type AttachedClientIdentityState } from './internal/attached-runtime'
import type { BrowserAuthAdapter } from './internal/auth-adapter'
import {
  createBetterConvexBrowserRuntime,
  type BetterConvexBrowserRuntime,
} from './internal/browser-runtime'

export interface BetterConvexVueRuntime {
  readonly browser: BetterConvexBrowserRuntime
  readonly identity: AttachedClientIdentityState
}

const BETTER_CONVEX_KEY: InjectionKey<BetterConvexVueRuntime> = Symbol('better-convex-vue')

export type BetterConvexAuthAdapter = BrowserAuthAdapter

export type CreateBetterConvexOptions =
  | { convexUrl: string; auth?: BetterConvexAuthAdapter; runtime?: never }
  | {
      runtime: import('./internal/attached-runtime').AttachedClientRuntime
      convexUrl?: never
      auth?: never
    }

export type BetterConvexPlugin = Plugin & {
  /** Safe cross-framework attachment; available after plugin installation. */
  attachment(): import('./internal/attached-runtime').AttachedClientRuntime
  ready(): Promise<void>
  refreshAuth(): Promise<void>
}

function makeClient(convexUrl: string) {
  return new ConvexClient(convexUrl, { unsavedChangesWarning: false })
}

export function createBetterConvex(options: CreateBetterConvexOptions): BetterConvexPlugin {
  let installed = false
  let dispose: (() => Promise<void> | void) | null = null
  let installedAttachment: import('./internal/attached-runtime').AttachedClientRuntime | null = null
  let installedBrowser: BetterConvexBrowserRuntime | null = null

  return Object.freeze({
    install(app: App) {
      if (installed) throw new Error('[better-convex-vue] plugin is already installed')
      installed = true
      const attached = 'runtime' in options && options.runtime ? options.runtime : null
      const browser = attached
        ? null
        : createBetterConvexBrowserRuntime({
            clientFactory: () => makeClient(options.convexUrl!),
            auth: options.auth,
          })
      const attachment = attached ?? browser!.attachment
      installedBrowser = browser ?? createAttachedBrowserFacade(attachment)
      installedAttachment = attachment
      const identity = attachClientIdentity(attachment)
      const runtime: BetterConvexVueRuntime = Object.freeze({
        browser: installedBrowser,
        identity,
      })
      app.provide(BETTER_CONVEX_KEY, runtime)
      dispose = async () => {
        identity.dispose()
        await browser?.dispose()
      }
      app.onUnmount(() => void dispose?.())
    },
    attachment() {
      if (!installedAttachment) {
        throw new Error(
          '[better-convex-vue] plugin must be installed before reading its attachment',
        )
      }
      return installedAttachment
    },
    async ready() {
      if (!installedBrowser) throw new Error('[better-convex-vue] plugin is not installed')
      await installedBrowser.ready()
    },
    async refreshAuth() {
      if (!installedBrowser) throw new Error('[better-convex-vue] plugin is not installed')
      await installedBrowser.refreshAuth()
    },
  })
}

function createAttachedBrowserFacade(
  runtime: import('./internal/attached-runtime').AttachedClientRuntime,
): BetterConvexBrowserRuntime {
  const state = shallowRef(runtime.connection?.snapshot() ?? disconnectedState())
  let consumers = 0
  let stop: (() => void) | null = null
  const addConsumer = () => {
    consumers += 1
    if (consumers === 1 && runtime.connection) {
      state.value = runtime.connection.snapshot()
      stop = runtime.connection.subscribe((next) => {
        state.value = next
      })
    }
    let active = true
    return () => {
      if (!active) return
      active = false
      consumers -= 1
      if (consumers === 0) {
        stop?.()
        stop = null
      }
    }
  }
  return {
    handle: runtime.client,
    identity: runtime.identity,
    attachment: runtime,
    connection: {
      state: readonly(state),
      addConsumer,
    },
    clientFor: (mode) => (mode === 'none' ? runtime.anonymousClient : runtime.client),
    ready: () => runtime.identity.waitForInitialSettlement(),
    refreshAuth: async () => {},
    dispose: async () => {},
  }
}

function disconnectedState() {
  return {
    hasInflightRequests: false,
    isWebSocketConnected: false,
    timeOfOldestInflightRequest: null,
    hasEverConnected: false,
    connectionCount: 0,
    connectionRetries: 0,
    inflightMutations: 0,
    inflightActions: 0,
  }
}

export function useBetterConvexRuntime(): BetterConvexVueRuntime {
  const runtime = useOptionalBetterConvexRuntime()
  if (!runtime) throw new Error('[better-convex-vue] plugin is not installed in this Vue app')
  return runtime
}

/** Internal SSR seam: callable composables may be created during render but cannot execute there. */
export function useOptionalBetterConvexRuntime(): BetterConvexVueRuntime | null {
  return inject(BETTER_CONVEX_KEY, null)
}
