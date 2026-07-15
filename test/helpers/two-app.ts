import { createApp, defineComponent, h, type App } from 'vue'

import { createNuxtApp } from '#app'

interface NuxtAppLike {
  _scope: { stop: () => void }
}

interface AppInstance<T> {
  vueApp: App
  result: T
  dispose: () => void
}

function bootAppInstance<T>(id: string, factory: () => T): AppInstance<T> {
  let result: T | undefined
  let ran = false

  const vueApp = createApp(
    defineComponent({
      name: `TwoAppHarness_${id}`,
      setup() {
        result = factory()
        ran = true
        return () => h('div')
      },
    }),
  )

  const nuxtApp = createNuxtApp({ id, vueApp }) as NuxtAppLike
  const host = document.createElement('div')
  vueApp.mount(host)

  if (!ran) throw new Error(`Factory for app "${id}" did not run during mount`)

  return {
    vueApp,
    result: result as T,
    dispose: () => {
      vueApp.unmount()
      nuxtApp._scope.stop()
      host.remove()
    },
  }
}

export function bootTwoApps<TA, TB>(factoryA: () => TA, factoryB: () => TB, idSuffix = '') {
  const appA = bootAppInstance(`app-a${idSuffix}`, factoryA)
  const appB = bootAppInstance(`app-b${idSuffix}`, factoryB)

  return {
    appA,
    appB,
    disposeAll: () => {
      appA.dispose()
      appB.dispose()
    },
  }
}
