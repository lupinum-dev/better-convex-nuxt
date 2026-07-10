/**
 * Lifecycle fixture: same-app plugin reevaluation vs. application replacement
 * (internal §17.3: "Distinguish same-app plugin reevaluation from
 * application replacement: reevaluation reuses the runtime with zero
 * creation/disposal, while an explicitly replaced app awaits disposal.").
 *
 * "Same-app reevaluation" here means: the SAME already-booted app instance
 * runs its plugin-registration logic again in place (the shape an HMR
 * update to a plugin module takes when Nuxt/Vite re-invokes
 * `defineNuxtPlugin`'s exported function against the still-live app,
 * without disposing the app itself) — a correct implementation is
 * idempotent and the live-resource count must stay constant, not grow.
 */
import { describe, expect, it } from 'vitest'

import { bootAppInstance } from '../two-app/two-app-harness'
import { createResourceCounter } from './resource-counter'

describe('lifecycle fixture: same-app plugin reevaluation', () => {
  it('reevaluating an idempotent plugin against the SAME app leaves live resource count constant', () => {
    const counter = createResourceCounter()
    let activeResource: { id: number; dispose: () => void } | undefined

    // Models a correct plugin: dispose the previous resource (if any) before
    // creating a new one on every (re-)evaluation — zero net growth.
    function idempotentPluginSetup() {
      activeResource?.dispose()
      activeResource = counter.create()
    }

    const app = bootAppInstance('same-app-reevaluation', () => {
      idempotentPluginSetup()
      return true
    })

    expect(counter.live()).toBe(1)

    // Reevaluate the SAME plugin logic against the SAME still-live app
    // instance three times (simulating three HMR passes with zero app
    // creation/disposal in between).
    for (let pass = 0; pass < 3; pass++) {
      idempotentPluginSetup()
    }

    expect(counter.created).toBe(4) // 1 initial + 3 reevaluations
    expect(counter.disposed).toBe(3) // each reevaluation disposed the prior one
    expect(counter.live()).toBe(1) // net-constant across reevaluation, as required

    app.dispose()
  })

  it('DEMONSTRATES the failure mode: a naive plugin without dispose-before-recreate grows on every reevaluation', () => {
    const counter = createResourceCounter()

    // Models a naive plugin: creates a new resource every time, never
    // disposing the previous one — exactly the class of leak internal
    // §17.3's HMR fixtures exist to catch.
    function naivePluginSetup() {
      counter.create()
    }

    const app = bootAppInstance('same-app-reevaluation-naive', () => {
      naivePluginSetup()
      return true
    })

    expect(counter.live()).toBe(1)

    for (let pass = 0; pass < 3; pass++) {
      naivePluginSetup()
    }

    expect(counter.live()).toBe(4) // leaked: grew instead of staying constant

    app.dispose()
  })
})
