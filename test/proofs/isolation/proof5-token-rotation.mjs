/**
 * PROOF FIXTURE — LIVE ISOLATION #5 (SAME-USER TOKEN ROTATION, internal §7.1.6).
 *
 * On ONE client with an ACTIVE subscription, a same-user token refresh must NOT
 * drop or re-subscribe (refetch) the active query. Measured across two forms of
 * rotation:
 *   (i)  UNCHANGED token: setAuth with a fetcher returning the identical JWT.
 *   (ii) CHANGED-but-same-identity token: setAuth with a freshly re-acquired A
 *        JWT (different token string, same userId).
 * For BOTH: zero wire ModifyQuerySet Add/Remove (subscription untouched), zero
 * auth-drop callbacks (onChange(false)), and the subscription keeps delivering
 * after the rotation. Server QueryUpdated deliveries are allowed.
 *
 * Port range 4600-4609. Uses port 4604.
 */
import { ConvexClient } from 'convex/browser'
import { anyApi } from 'convex/server'

import { acquireToken, bootPlaygroundServer, reacquireToken } from '../support/acquire-token.mjs'
import {
  convexUrl,
  countAuthenticate,
  countModifyQuerySet,
  makeSpyWebSocket,
  newWireRecord,
  sleep,
  waitUntil,
} from './support/ws-spy.mjs'

const getCounter = anyApi.proofSupport.getCounter
const incrementCounter = anyApi.proofSupport.incrementCounter
const identityEcho = anyApi.proofSupport.identityEcho

async function main() {
  const url = convexUrl()
  const results = { assertions: [] }
  const assert = (name, pass, detail) => results.assertions.push({ name, pass, detail })

  const server = await bootPlaygroundServer({ port: 4604 })
  let client
  try {
    const userA = await acquireToken({
      baseUrl: server.baseUrl,
      email: 'proof-a@example.test',
      password: 'Password123!',
      name: 'Proof A',
    })

    const rec = newWireRecord()
    client = new ConvexClient(url, {
      unsavedChangesWarning: false,
      webSocketConstructor: makeSpyWebSocket(rec),
    })

    const authDrops = []
    let authConfirms = 0
    client.setAuth(
      async () => userA.token,
      (isAuth) => {
        if (isAuth) authConfirms += 1
        else authDrops.push(Date.now())
      },
    )
    await waitUntil(() => authConfirms >= 1, { timeoutMs: 10000 })

    const key = `rot-${Date.now()}`
    let cb = 0
    const values = []
    const unsub = client.onUpdate(getCounter, { key }, (v) => {
      cb += 1
      values.push(v)
    })
    await waitUntil(() => cb >= 1)
    // Let the initial setConfig's background refetch (forceRefreshToken:true,
    // same token => notRefetching) settle before snapshotting.
    await sleep(1000)

    const baseline = {
      ...countModifyQuerySet(rec),
      authenticate: countAuthenticate(rec),
      cb,
      authDrops: authDrops.length,
    }

    // ============ (i) UNCHANGED TOKEN ROTATION ============
    client.setAuth(
      async () => userA.token,
      (isAuth) => {
        if (isAuth) authConfirms += 1
        else authDrops.push(Date.now())
      },
    )
    await sleep(1500)
    const afterUnchanged = { ...countModifyQuerySet(rec), authenticate: countAuthenticate(rec) }
    assert(
      '(i) unchanged-token rotation: ZERO new query Add',
      afterUnchanged.add - baseline.add === 0,
      `add ${baseline.add}->${afterUnchanged.add}`,
    )
    assert(
      '(i) unchanged-token rotation: ZERO query Remove',
      afterUnchanged.remove - baseline.remove === 0,
      `remove ${baseline.remove}->${afterUnchanged.remove}`,
    )
    assert(
      '(i) unchanged-token rotation: no auth-drop callback',
      authDrops.length === baseline.authDrops,
      `drops ${baseline.authDrops}->${authDrops.length}`,
    )

    // Subscription still live after unchanged rotation.
    const cbBeforeMut1 = cb
    const v1 = await client.mutation(incrementCounter, { key })
    await waitUntil(() => cb > cbBeforeMut1)
    assert(
      '(i) subscription still delivers after unchanged rotation',
      cb > cbBeforeMut1 && values[values.length - 1] === v1,
      `delivered=${values[values.length - 1]} server=${v1}`,
    )

    // ============ (ii) CHANGED-BUT-SAME-IDENTITY TOKEN ROTATION ============
    const rotated = await reacquireToken({
      baseUrl: server.baseUrl,
      email: 'proof-a@example.test',
      password: 'Password123!',
    })
    assert(
      '(ii) rotated token differs from original',
      rotated.token !== userA.token,
      `differs=${rotated.token !== userA.token}`,
    )
    assert(
      '(ii) rotated token has same identity (userId)',
      rotated.userId === userA.userId,
      `rotated=${rotated.userId} original=${userA.userId}`,
    )

    const beforeChanged = { ...countModifyQuerySet(rec), authenticate: countAuthenticate(rec) }
    const dropsBeforeChanged = authDrops.length
    client.setAuth(
      async () => rotated.token,
      (isAuth) => {
        if (isAuth) authConfirms += 1
        else authDrops.push(Date.now())
      },
    )
    await sleep(1800)
    const afterChanged = { ...countModifyQuerySet(rec), authenticate: countAuthenticate(rec) }
    assert(
      '(ii) changed-same-identity rotation: ZERO new query Add',
      afterChanged.add - beforeChanged.add === 0,
      `add ${beforeChanged.add}->${afterChanged.add}`,
    )
    assert(
      '(ii) changed-same-identity rotation: ZERO query Remove',
      afterChanged.remove - beforeChanged.remove === 0,
      `remove ${beforeChanged.remove}->${afterChanged.remove}`,
    )
    assert(
      '(ii) changed-same-identity rotation: no auth-drop callback',
      authDrops.length === dropsBeforeChanged,
      `drops ${dropsBeforeChanged}->${authDrops.length}`,
    )

    // Identity still A after rotation, and subscription still delivers.
    const idAfter = await client.query(identityEcho, {})
    assert(
      '(ii) identity remains user A after rotation',
      idAfter && idAfter.subject === userA.userId,
      `subject=${idAfter && idAfter.subject}`,
    )
    const cbBeforeMut2 = cb
    const v2 = await client.mutation(incrementCounter, { key })
    await waitUntil(() => cb > cbBeforeMut2)
    assert(
      '(ii) subscription still delivers after changed-same-identity rotation',
      cb > cbBeforeMut2 && values[values.length - 1] === v2,
      `delivered=${values[values.length - 1]} server=${v2}`,
    )

    unsub()
    results.counts = {
      baseline,
      afterUnchanged,
      beforeChanged,
      afterChanged,
      totalSubscriptionCallbacks: cb,
      totalAuthConfirms: authConfirms,
      totalAuthDrops: authDrops.length,
      note: 'Authenticate deltas are reported for context; the load-bearing invariant is add/remove == 0 (subscriptions never re-fetched) with continued delivery.',
    }
  } finally {
    if (client) await Promise.race([client.close(), sleep(2000)]).catch(() => {})
    await server.release()
  }
  return results
}

main()
  .then((r) => {
    const failed = r.assertions.filter((a) => !a.pass)
    console.log(
      JSON.stringify(
        { proof: 'token-rotation', verdict: failed.length === 0 ? 'PASS' : 'FAIL', ...r },
        null,
        2,
      ),
    )
    process.exit(failed.length === 0 ? 0 : 1)
  })
  .catch((e) => {
    console.log(
      JSON.stringify(
        { proof: 'token-rotation', verdict: 'ERROR', error: String((e && e.stack) || e) },
        null,
        2,
      ),
    )
    process.exit(2)
  })
