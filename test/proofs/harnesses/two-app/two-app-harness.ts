/**
 * Two-app harness (internal §17.3 / §20 Phase 0 "senior-owned spike").
 *
 * Purpose: create TWO independent Nuxt application runtimes in a single
 * Node/Vitest process and prove that per-app reactive state (`useState`,
 * `nuxtApp.provide`) does not bleed between them. This is a real mechanic
 * proof, not a tautology: see `two-app.nuxt.test.ts` for a companion test
 * that deliberately uses a module-scope singleton and shows it DOES bleed,
 * which is exactly the class of bug internal §19.2 wants proof-gated
 * ("module-global DevTools registries after per-app fixture passes").
 *
 * Why not `mountSuspended`? `@nuxt/test-utils`'s `mountSuspended` calls
 * `cleanupAll()` on every invocation and reuses one shared `vueApp` instance
 * for provides/directives across the whole test file (see
 * `@nuxt/test-utils/dist/runtime-utils/index.mjs`). It mounts one component
 * at a time against one implicit Nuxt app — it is not designed to keep two
 * independent app instances alive concurrently. That is precisely why
 * internal §17.3 calls the two-app harness a "senior-owned Phase 0 spike":
 * it needs the low-level `#app` API (`createNuxtApp`) directly.
 *
 * Isolation mechanic (verified empirically, see the file-level comment in
 * `two-app.nuxt.test.ts`): Nuxt's `useNuxtApp()` resolves the "current" app
 * two ways — (1) via Vue's component injection context
 * (`getCurrentInstance()?.appContext.app.$nuxt`), checked FIRST, or (2) via
 * an `unctx`-backed global keyed by the build's static `appId` as a fallback.
 * Path (2) is process-wide and does NOT vary per `createNuxtApp({ id })` —
 * passing a distinct `id` alone does not isolate composables called outside
 * a component. Path (1) DOES isolate correctly per mounted Vue app, because
 * each `vueApp` gets its own `$nuxt` getter. Therefore every composable call
 * this harness needs isolated MUST run inside `factory()`, which executes
 * inside a real mounted component's `setup()` — never via a bare
 * `nuxtApp.runWithContext()` called from outside a component tree.
 *
 * Plugging in a later phase's per-app Convex context: call
 * `useNuxtApp()`/`nuxtApp.provide('convex', client)` from inside `factory()`
 * (it has component injection context there), one distinct client per app
 * instance. `bootAppInstance` returns the live `nuxtApp` so a test can also
 * assert on `nuxtApp.$convex` directly after boot.
 */
import { createApp, defineComponent, h, type App } from 'vue'

// `#app` resolves to the real Nuxt application runtime only under the
// vitest "nuxt" environment (`environment: 'nuxt'` in vitest.config.ts).
import { createNuxtApp } from '#app'

export interface NuxtAppLike {
  _id: string
  _scope: { active: boolean; stop: () => void }
  provide: (name: string, value: unknown) => void
  runWithContext: <T>(fn: () => T) => T
  [key: string]: unknown
}

export interface AppInstance<T> {
  id: string
  vueApp: App
  nuxtApp: NuxtAppLike
  result: T
  /** Unmounts the Vue app, stops its effect scope, and removes the host element. */
  dispose: () => void
}

/**
 * Boots one independent Nuxt-app-like runtime and mounts a component whose
 * `setup()` runs `factory()`. `factory` must be synchronous (no Suspense) —
 * that's sufficient to prove composable isolation and covers everything
 * this harness's callers need. Document this limit rather than widening
 * scope: a later phase that needs async plugin setup inside the harness
 * should extend `bootAppInstance` to await `nextTick()`/a `Suspense`
 * boundary rather than bypassing the mounted-component requirement above.
 */
export function bootAppInstance<T>(id: string, factory: () => T): AppInstance<T> {
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

  if (!ran) {
    throw new Error(
      `[two-app-harness] factory for app "${id}" did not run synchronously during mount`,
    )
  }

  return {
    id,
    vueApp,
    nuxtApp,
    result: result as T,
    dispose: () => {
      vueApp.unmount()
      nuxtApp._scope.stop()
      host.remove()
    },
  }
}

export interface TwoAppHarness<TA, TB> {
  appA: AppInstance<TA>
  appB: AppInstance<TB>
  disposeAll: () => void
}

/** Boots two independent app instances at once; pass a suffix to avoid id collisions across parallel tests. */
export function bootTwoApps<TA, TB>(
  factoryA: () => TA,
  factoryB: () => TB,
  idSuffix = '',
): TwoAppHarness<TA, TB> {
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
