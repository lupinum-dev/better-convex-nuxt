/**
 * Lifecycle fixture: application replacement (internal §17.3, contrast with
 * `same-app-reevaluation.nuxt.test.ts`).
 *
 * An explicitly replaced app disposes the OLD app instance and creates a
 * genuinely NEW one — "Run repeated app-create/app-dispose cycles and
 * assert all live resource counts return to zero after each explicit
 * disposal." Uses the two-app harness's `bootAppInstance` since it is the
 * one building block in this repo that creates/disposes a real, independent
 * app-like runtime (`createNuxtApp` + a mounted Vue app + an effect scope)
 * without another `mountSuspended` call implicitly tearing down the
 * previous one.
 */
import { describe, expect, it } from 'vitest'

import { bootAppInstance } from '../two-app/two-app-harness'
import { createResourceCounter } from './resource-counter'

describe('lifecycle fixture: application replacement', () => {
  it('replacing the app disposes the old resource and live count returns to zero before the new one is created', () => {
    const counter = createResourceCounter()

    function pluginSetup() {
      return counter.create()
    }

    let app = bootAppInstance('app-replacement-0', () => pluginSetup())
    expect(counter.live()).toBe(1)

    for (let generation = 1; generation <= 3; generation++) {
      const previousResource = app.result
      const previousNuxtApp = app.nuxtApp

      // Explicit replacement: old app is disposed first ...
      app.dispose()
      previousResource.dispose()
      expect(counter.live()).toBe(0) // returns to zero after each explicit disposal
      expect(previousNuxtApp._scope.active).toBe(false)

      // ... only THEN is a genuinely new app created (not a reevaluation of the old one).
      app = bootAppInstance(`app-replacement-${generation}`, () => pluginSetup())
      expect(counter.live()).toBe(1)
      expect(app.nuxtApp._scope.active).toBe(true)
      expect(app.nuxtApp).not.toBe(previousNuxtApp) // a genuinely new runtime, not the same one reused
    }

    app.dispose()
    app.result.dispose()
    expect(counter.live()).toBe(0)
  })
})
