import { mountSuspended } from '@nuxt/test-utils/runtime'
import {
  defineComponent,
  getCurrentScope,
  h,
  nextTick,
  onScopeDispose,
  type ComponentPublicInstance,
} from 'vue'

import { useNuxtApp, useRuntimeConfig } from '#imports'

let currentConvexTarget: Record<PropertyKey, unknown> | null = null
let currentAuthTarget: Record<PropertyKey, unknown> | null = null

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

interface CaptureOptions {
  convex?: unknown
  auth?: unknown
  convexConfig?: Record<string, unknown>
  payloadData?: Record<string, unknown>
}

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
  const registeredHookRemovers: Array<() => void> = []

  const wrapper = await mountSuspended(
    defineComponent({
      setup() {
        const nuxtApp = useNuxtApp()
        const runtimeConfig = useRuntimeConfig()
        const originalHook = nuxtApp.hook.bind(nuxtApp)

        nuxtAppRef = nuxtApp

        nuxtApp.hook = ((event, callback) => {
          const removeHook = originalHook(event, callback)
          registeredHookRemovers.push(removeHook)

          if (getCurrentScope()) {
            onScopeDispose(() => {
              removeHook()
            })
          }

          return removeHook
        }) as typeof nuxtApp.hook

        if (options.convex === undefined) {
          currentConvexTarget = null
        }
        if (options.auth === undefined) {
          currentAuthTarget = null
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

  const wrappedComponent = wrapper as unknown as ComponentPublicInstance & { unmount: () => void }
  const originalUnmount = wrappedComponent.unmount.bind(wrappedComponent)
  wrappedComponent.unmount = () => {
    while (registeredHookRemovers.length > 0) {
      const removeHook = registeredHookRemovers.pop()
      removeHook?.()
    }
    originalUnmount()
  }

  return {
    result,
    nuxtApp: nuxtAppRef,
    wrapper: wrappedComponent,
    flush,
  }
}
