import { describe, expect, it } from 'vitest'
import { ref } from 'vue'

import {
  createConvexAuthCoordinator,
  type AuthClientWithConvex,
  type ConvexAuthCoordinatorState,
} from '../../src/runtime/auth/client-engine'
// Read-only import of the Phase 0 senior-owned two-app harness substrate
// (internal §17.3 / §20). This file does not modify anything under
// `test/proofs/**` — it only reuses `bootTwoApps`/`bootAppInstance`.
import { bootTwoApps } from '../proofs/harnesses/two-app/two-app-harness'

/**
 * Two Nuxt applications in one process have ISOLATED auth coordinators (vNext
 * §8 "Mandatory scenarios": "Two Nuxt apps in one process have isolated
 * runtime instances"). Each `factory()` below runs inside a real mounted
 * component (the harness's documented isolation mechanic), synchronously
 * constructing one coordinator per app — mirroring one Better Auth client per
 * Nuxt app (vNext §8 "Client instantiation").
 */

function toBase64Url(value: string): string {
  return Buffer.from(value, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}
function makeJwt(sub: string): string {
  const payload = { sub, exp: Math.floor(Date.now() / 1000) + 3600 }
  return `${toBase64Url(JSON.stringify({ alg: 'none' }))}.${toBase64Url(JSON.stringify(payload))}.sig`
}

function makeCoordinatorFor(user: string) {
  const authClient = {
    convex: { token: async () => ({ data: { token: makeJwt(user) }, error: null }) },
    signOut: async () => ({ data: { token: '' }, error: null }),
    signIn: {},
    signUp: {},
  } as unknown as AuthClientWithConvex

  const state: ConvexAuthCoordinatorState = {
    token: ref<string | null>(null),
    user: ref(null),
    pending: ref(true),
    authError: ref<string | null>(null),
  }

  const coordinator = createConvexAuthCoordinator({ authClient, state })

  const makeClient = () =>
    ({
      setAuth: (
        fetcher: (o: { forceRefreshToken: boolean }) => Promise<string | null>,
        onChange: (ok: boolean) => void,
      ) => {
        void Promise.resolve(fetcher({ forceRefreshToken: false })).then((t) =>
          onChange(Boolean(t)),
        )
      },
      close: async () => {},
    }) as unknown as import('convex/browser').ConvexClient

  // A minimal fake owner (mirrors the pattern in
  // test/unit/auth-generation-races.test.ts): on every identityGeneration
  // change, hand the coordinator a fresh candidate client through the port —
  // this is what drives `commitTransition`'s confirmation to resolve.
  let lastGeneration = coordinator.port.snapshot().identityGeneration
  coordinator.port.subscribe(() => {
    const snapshot = coordinator.port.snapshot()
    if (snapshot.identityGeneration === lastGeneration) return
    lastGeneration = snapshot.identityGeneration
    void coordinator.port.initializePrimary(makeClient(), snapshot.authEpoch)
  })

  coordinator.attachPrimary(makeClient())

  return { coordinator, state }
}

describe('two Nuxt applications in one process: isolated auth coordinators (vNext §8)', () => {
  it('each app settles its own identity independent of the other', async () => {
    const { appA, appB, disposeAll } = bootTwoApps(
      () => makeCoordinatorFor('A'),
      () => makeCoordinatorFor('B'),
      '-auth-identity',
    )

    await appA.result.coordinator.ready({ timeoutMs: 0 })
    await appB.result.coordinator.ready({ timeoutMs: 0 })

    expect(appA.result.state.user.value).toEqual(expect.objectContaining({ id: 'A' }))
    expect(appB.result.state.user.value).toEqual(expect.objectContaining({ id: 'B' }))
    expect(appA.result.coordinator.status.value).toBe('authenticated')
    expect(appB.result.coordinator.status.value).toBe('authenticated')

    disposeAll()
  })

  it("signing out app A's coordinator never touches app B's identity", async () => {
    const { appA, appB, disposeAll } = bootTwoApps(
      () => makeCoordinatorFor('A'),
      () => makeCoordinatorFor('B'),
      '-auth-signout',
    )

    await appA.result.coordinator.ready({ timeoutMs: 0 })
    await appB.result.coordinator.ready({ timeoutMs: 0 })

    await appA.result.coordinator.signOut()

    expect(appA.result.state.user.value).toBeNull()
    expect(appA.result.coordinator.status.value).toBe('anonymous')
    // B fully unaffected — no shared module-scope state bled across apps.
    expect(appB.result.state.user.value).toEqual(expect.objectContaining({ id: 'B' }))
    expect(appB.result.coordinator.status.value).toBe('authenticated')

    disposeAll()
  })

  it('disposing one coordinator does not affect the other', async () => {
    const { appA, appB, disposeAll } = bootTwoApps(
      () => makeCoordinatorFor('A'),
      () => makeCoordinatorFor('B'),
      '-auth-dispose',
    )

    await appA.result.coordinator.ready({ timeoutMs: 0 })
    await appB.result.coordinator.ready({ timeoutMs: 0 })

    appA.result.coordinator.dispose()
    // B's coordinator is still fully usable after A's disposal.
    expect(appB.result.coordinator.status.value).toBe('authenticated')
    await expect(appB.result.coordinator.ready({ timeoutMs: 0 })).resolves.toBe('authenticated')

    disposeAll()
  })
})
