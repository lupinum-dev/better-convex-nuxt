import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent, h, nextTick, type ComponentPublicInstance } from 'vue'
import { useNuxtApp, useRuntimeConfig } from '#imports'

let currentConvexTarget: Record<string, unknown> | null = null
let currentAuthTarget: Record<string, unknown> | null = null

const convexProxy = new Proxy<Record<string, unknown>>({}, {
  get(_target, key) {
    const target = currentConvexTarget
    if (!target) return undefined
    const value = target[key]
    return typeof value === 'function' ? value.bind(target) : value
  },
})

const authProxy = new Proxy<Record<string, unknown>>({}, {
  get(_target, key) {
    const target = currentAuthTarget
    if (!target) return undefined
    const value = target[key]
    return typeof value === 'function' ? value.bind(target) : value
  },
})

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

  const wrapper = await mountSuspended(defineComponent({
    setup() {
      const nuxtApp = useNuxtApp()
      const runtimeConfig = useRuntimeConfig()

      nuxtAppRef = nuxtApp

      if (options.convex === undefined) {
        currentConvexTarget = null
      }
      if (options.auth === undefined) {
        currentAuthTarget = null
      }

      if (options.convex !== undefined) {
        currentConvexTarget = options.convex as Record<string, unknown>
        if (!(nuxtApp as typeof nuxtApp & { $convex?: unknown }).$convex) {
          nuxtApp.provide('convex', convexProxy)
        }
      }

      if (options.auth !== undefined) {
        currentAuthTarget = options.auth as Record<string, unknown>
        if (!(nuxtApp as typeof nuxtApp & { $auth?: unknown }).$auth) {
          nuxtApp.provide('auth', authProxy)
        }
      }

      const publicConfig = (runtimeConfig.public ??= {}) as Record<string, unknown>
      const convexConfig = (publicConfig.convex ??= {}) as Record<string, unknown>
      Object.assign(convexConfig, { url: 'http://127.0.0.1:3214' }, options.convexConfig ?? {})

      if (options.payloadData) {
        Object.assign(nuxtApp.payload.data, options.payloadData)
      }

      result = factory()

      return () => h('div')
    },
  }))

  const flush = async () => {
    await nextTick()
    await Promise.resolve()
    await nextTick()
  }

  if (result === undefined || !nuxtAppRef) {
    throw new Error('Failed to capture Nuxt composable result')
  }

  return {
    result,
    nuxtApp: nuxtAppRef,
    wrapper: wrapper as unknown as ComponentPublicInstance & { unmount: () => void },
    flush,
  }
}
