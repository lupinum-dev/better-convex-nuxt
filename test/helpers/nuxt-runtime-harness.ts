import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent, h, nextTick, type ComponentPublicInstance } from 'vue'

import { useNuxtApp, useRuntimeConfig, useState } from '#imports'

import { ANONYMOUS_IDENTITY, type AuthIdentity } from '../../src/runtime/auth/auth-identity'
import type { ConvexAuthCoordinator } from '../../src/runtime/auth/client-engine'
import type { ConvexClientOwner } from '../../src/runtime/client/client-owner'
import type { ConvexRuntimeContext } from '../../src/runtime/runtime-context'

let previousWrapper: { unmount: () => void } | null = null
let currentConvexTarget: Record<PropertyKey, unknown> | null = null
let currentAuthTarget: Record<PropertyKey, unknown> | null = null
let currentOwnerTarget: Record<PropertyKey, unknown> | null = null
let currentAuthCoordinator: ConvexAuthCoordinator | null = null

const convexProxy = new Proxy<Record<PropertyKey, unknown>>(
  {},
  {
    get(_target, key) {
      const target = currentConvexTarget
      if (!target) return undefined
      const value = target[key]
      return typeof value === 'function' ? value.bind(target) : value
    },
  },
)

const authProxy = new Proxy<Record<PropertyKey, unknown>>(
  {},
  {
    get(_target, key) {
      const target = currentAuthTarget
      if (!target) return undefined
      const value = target[key]
      return typeof value === 'function' ? value.bind(target) : value
    },
  },
)

// The per-app client owner (vNext §5.4) — provided once as a stable proxy so a
// whole test file (which shares one implicit vueApp under @nuxt/test-utils) can
// swap the backing owner per test despite Nuxt's one-time `provide`.
const ownerProxy = new Proxy<Record<PropertyKey, unknown>>(
  {},
  {
    get(_target, key) {
      const target = currentOwnerTarget
      if (!target) return undefined
      const value = target[key]
      if (value === undefined && key === 'getDevtoolsSink') return () => null
      if (value === undefined && key === 'attachDevtoolsSink') return () => null
      return typeof value === 'function' ? value.bind(target) : value
    },
  },
)

// Nuxt provides values once per application, while this harness reuses one
// application across captures. Keep the provided context stable and replace
// only its test-owned targets between captures.
const runtimeProxy: ConvexRuntimeContext = {
  get owner() {
    return currentOwnerTarget
      ? (ownerProxy as unknown as ConvexClientOwner)
      : (undefined as unknown as ConvexClientOwner)
  },
  getAuthCoordinator: () => currentAuthCoordinator,
  attachAuthCoordinator: (coordinator) => {
    currentAuthCoordinator = coordinator
  },
}

interface CaptureOptions {
  convex?: unknown
  auth?: unknown
  owner?: unknown
  convexConfig?: Record<string, unknown>
  payloadData?: Record<string, unknown>
}

const DEFAULT_OWNER_CONNECTION_STATE = {
  hasInflightRequests: false,
  isWebSocketConnected: false,
  timeOfOldestInflightRequest: null,
  hasEverConnected: false,
  connectionCount: 0,
  connectionRetries: 0,
  inflightMutations: 0,
  inflightActions: 0,
}

/**
 * A minimal per-app client owner (vNext §5.4) synthesized from the provided
 * `convex` mock when a test does not pass an explicit `owner`. The query
 * composables reach their transport through the owner (`getPrimary` /
 * `getAnonymous`), so a single-client mock is exposed as both. Tests that need a
 * distinct `none` anonymous client pass an explicit `owner`.
 */
function createSyntheticOwner(): Record<PropertyKey, unknown> {
  const primary = () => currentConvexTarget
  return {
    get handle() {
      const c = currentConvexTarget
      return c
        ? {
            query: c.query,
            mutation: c.mutation,
            action: c.action,
            onUpdate: c.onUpdate,
          }
        : undefined
    },
    getPrimary: () => {
      const c = currentConvexTarget
      return c ? { client: c, identityGeneration: 0 } : null
    },
    getAnonymous: () => primary(),
    replacePrimary: async () => primary(),
    attachAuthPort: () => {},
    connection: {
      state: { value: { ...DEFAULT_OWNER_CONNECTION_STATE } },
      addConsumer: () => () => {},
    },
    addDisposer: () => {},
    getDevtoolsSink: () => null,
    attachDevtoolsSink: () => null,
    dispose: async () => {},
  }
}
const syntheticOwner: Record<PropertyKey, unknown> = createSyntheticOwner()

export async function captureInNuxt<T>(
  factory: () => T,
  options: CaptureOptions = {},
): Promise<{
  result: T
  nuxtApp: ReturnType<typeof useNuxtApp>
  wrapper: ComponentPublicInstance & { unmount: () => void }
  flush: () => Promise<void>
}> {
  let result: T | undefined
  let nuxtAppRef: ReturnType<typeof useNuxtApp> | undefined

  // Unmount the previous capture's component so its still-alive query watchers
  // do not react to this test's shared `useState`/`$fetch` state (identity-
  // reactive composables refetch on `convex:identity` changes). Tests that need two
  // live components at once pass them to a single capture.
  if (previousWrapper) {
    try {
      previousWrapper.unmount()
    } catch {
      // ignore teardown errors from an already-unmounted wrapper
    }
    previousWrapper = null
  }

  const wrapper = await mountSuspended(
    defineComponent({
      setup() {
        const nuxtApp = useNuxtApp()
        const runtimeConfig = useRuntimeConfig()

        nuxtAppRef = nuxtApp

        // A whole test file shares one implicit Nuxt app, so `useState` auth keys
        // leak between tests. Reset them to a clean slate before the factory runs
        // (composables key identity off `convex:identity`, so a leaked signed-in user
        // would spuriously trigger identity transitions and refetches).
        useState<AuthIdentity>('convex:identity', () => ANONYMOUS_IDENTITY).value =
          ANONYMOUS_IDENTITY
        useState<string | null>('convex:authError', () => null).value = null
        currentAuthCoordinator = null

        if (!nuxtApp.$convexRuntime) {
          nuxtApp.provide('convexRuntime', runtimeProxy)
        }

        if (options.convex === undefined) {
          currentConvexTarget = null
        }
        if (options.auth === undefined) {
          currentAuthTarget = null
        }
        if (options.owner === undefined) {
          // Synthesize a per-app client owner from the convex mock so query
          // composables (which reach transport through the owner) work without
          // every test constructing one. Tests needing a distinct `none`
          // anonymous client pass an explicit `owner`.
          currentOwnerTarget = options.convex !== undefined ? syntheticOwner : null
        }

        if (options.convex !== undefined) {
          currentConvexTarget = options.convex as Record<PropertyKey, unknown>
          if (!(nuxtApp as typeof nuxtApp & { $convex?: unknown }).$convex) {
            nuxtApp.provide('convex', convexProxy)
          }
        }

        if (options.auth !== undefined) {
          currentAuthTarget = options.auth as Record<PropertyKey, unknown>
          if (!(nuxtApp as typeof nuxtApp & { $auth?: unknown }).$auth) {
            nuxtApp.provide('auth', authProxy)
          }
        }

        if (options.owner !== undefined) {
          currentOwnerTarget = options.owner as Record<PropertyKey, unknown>
        }

        const runtimeConfigMutable = runtimeConfig as unknown as {
          public?: Record<string, unknown>
        }
        const publicConfig = (runtimeConfigMutable.public ??= {})
        const convexConfig = (publicConfig.convex ??= {}) as Record<string, unknown>
        Object.assign(convexConfig, { url: 'http://127.0.0.1:3214' }, options.convexConfig ?? {})

        if (options.payloadData) {
          Object.assign(nuxtApp.payload.data, options.payloadData)
        }

        result = factory()

        return () => h('div')
      },
    }),
  )

  const flush = async () => {
    await nextTick()
    await Promise.resolve()
    await nextTick()
  }

  if (result === undefined || !nuxtAppRef) {
    throw new Error('Failed to capture Nuxt composable result')
  }

  previousWrapper = wrapper as unknown as { unmount: () => void }

  return {
    result,
    nuxtApp: nuxtAppRef,
    wrapper: wrapper as unknown as ComponentPublicInstance & {
      unmount: () => void
    },
    flush,
  }
}
