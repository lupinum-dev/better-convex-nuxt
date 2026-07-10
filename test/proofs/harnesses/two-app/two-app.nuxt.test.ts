import { describe, expect, it } from 'vitest'

import { useNuxtApp, useState } from '#app'

import { bootAppInstance, bootTwoApps } from './two-app-harness'

describe('two-app harness: per-app runtime isolation', () => {
  it('useState markers do not bleed between two in-process app instances', () => {
    const { appA, appB, disposeAll } = bootTwoApps(
      () => useState('marker', () => 'A-default'),
      () => useState('marker', () => 'B-default'),
      '-state',
    )

    appA.result.value = 'A-mutated'

    expect(appA.result.value).toBe('A-mutated')
    expect(appB.result.value).toBe('B-default') // no cross-app bleed

    disposeAll()
  })

  it('nuxtApp.provide is isolated per app (models a later-phase per-app Convex client)', () => {
    const clientA = { id: 'convex-client-A' }
    const clientB = { id: 'convex-client-B' }

    const { appA, appB, disposeAll } = bootTwoApps(
      () => {
        const nuxtApp = useNuxtApp()
        nuxtApp.provide('convex', clientA)
        return nuxtApp
      },
      () => {
        const nuxtApp = useNuxtApp()
        nuxtApp.provide('convex', clientB)
        return nuxtApp
      },
      '-provide',
    )

    expect((appA.nuxtApp as unknown as { $convex: unknown }).$convex).toBe(clientA)
    expect((appB.nuxtApp as unknown as { $convex: unknown }).$convex).toBe(clientB)
    expect((appA.nuxtApp as unknown as { $convex: unknown }).$convex).not.toBe(
      (appB.nuxtApp as unknown as { $convex: unknown }).$convex,
    )

    disposeAll()
  })

  it('disposeAll stops each app effect scope independently (no shared teardown)', () => {
    const { appA, appB, disposeAll } = bootTwoApps(
      () => useState('marker', () => 'A'),
      () => useState('marker', () => 'B'),
      '-dispose',
    )

    expect(appA.nuxtApp._scope.active).toBe(true)
    expect(appB.nuxtApp._scope.active).toBe(true)

    appA.dispose()
    expect(appA.nuxtApp._scope.active).toBe(false)
    expect(appB.nuxtApp._scope.active).toBe(true) // B unaffected by A's disposal

    appB.dispose()
    expect(appB.nuxtApp._scope.active).toBe(false)

    disposeAll() // idempotent-ish: unmount() on an already-unmounted app is a documented no-op in Vue
  })

  it('DEMONSTRATES the bug class this harness is meant to catch: a module-scope singleton bleeds across apps', () => {
    // This models the exact anti-pattern internal §19.2 proof-gates the deletion of:
    // "Module-global DevTools registries after per-app fixture passes." A plugin
    // that stashes its "active client" in a bare module-level variable (instead of
    // on the per-app nuxtApp/useState) will have the SECOND app's boot silently
    // overwrite what the FIRST app's already-captured reference resolves to.
    let naiveModuleScopeActiveClient: { owner: string } | undefined

    function naivePluginSetup(owner: string) {
      naiveModuleScopeActiveClient = { owner }
      // returns a lazy accessor, simulating a composable that reads the
      // "current" client at call time rather than capturing it once
      return () => naiveModuleScopeActiveClient
    }

    const appA = bootAppInstance('app-a-leak', () => naivePluginSetup('A'))
    const readCurrentClientFromA = appA.result

    expect(readCurrentClientFromA()?.owner).toBe('A') // correct before B boots

    const appB = bootAppInstance('app-b-leak', () => naivePluginSetup('B'))

    // Bug reproduced: app A's own accessor now resolves to app B's client,
    // because the naive plugin used module scope instead of per-app state.
    expect(readCurrentClientFromA()?.owner).toBe('B')

    appA.dispose()
    appB.dispose()
  })
})
