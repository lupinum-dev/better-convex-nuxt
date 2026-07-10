/**
 * PROOF FIXTURE — LIVE ISOLATION #1 (WIRE FIXTURE, internal §7.1).
 *
 * Raw ConvexClient (unsavedChangesWarning:false) against the LIVE deployment.
 * Subscribe to proofSupport.getCounter via onUpdate, mutate via
 * proofSupport.incrementCounter, and COUNT:
 *   - subscription callbacks fired,
 *   - exactly one outgoing QuerySetModification (ModifyQuerySet/Add) per subscribe,
 *   - de-dup: two listeners for the same (fn,args) => one wire Add (§7.1.1-2),
 *   - removing one listener leaves the other live (§7.1.3),
 *   - removing the final listener emits exactly one wire Remove (§7.1.4),
 *   - after full unsubscribe, further mutations deliver ZERO further callbacks.
 *
 * Proves Convex owns subscription delivery => the custom registry/refcount
 * layer (subscriptionRegistry, acquireQuerySubscription, ...) can be deleted.
 */
import { ConvexClient } from 'convex/browser'
import { anyApi } from 'convex/server'

import {
  convexUrl,
  countModifyQuerySet,
  makeSpyWebSocket,
  newWireRecord,
  sleep,
  waitUntil,
} from './support/ws-spy.mjs'

const getCounter = anyApi.proofSupport.getCounter
const incrementCounter = anyApi.proofSupport.incrementCounter

async function main() {
  const url = convexUrl()
  const key = `wire-${Date.now()}`
  const rec = newWireRecord()
  const client = new ConvexClient(url, {
    unsavedChangesWarning: false,
    webSocketConstructor: makeSpyWebSocket(rec),
  })

  const results = { assertions: [] }
  const assert = (name, pass, detail) => results.assertions.push({ name, pass, detail })

  // --- single subscribe ---
  let cbCount = 0
  const values = []
  const unsub = client.onUpdate(getCounter, { key }, (v) => {
    cbCount += 1
    values.push(v)
  })

  // initial value (0) should arrive
  await waitUntil(() => cbCount >= 1)
  const initialValue = values[values.length - 1]

  const afterSubscribe = countModifyQuerySet(rec)
  assert(
    'one ModifyQuerySet Add per subscribe',
    afterSubscribe.add === 1,
    `add=${afterSubscribe.add} messages=${afterSubscribe.messages}`,
  )
  assert('initial value delivered (0)', initialValue === 0, `initialValue=${initialValue}`)

  // --- mutate; callback must fire with new value ---
  const cbBeforeMut = cbCount
  const v1 = await client.mutation(incrementCounter, { key })
  await waitUntil(() => cbCount > cbBeforeMut)
  assert(
    'callback fired after mutation #1',
    cbCount > cbBeforeMut,
    `cbCount ${cbBeforeMut}->${cbCount}`,
  )
  assert(
    'delivered value == server counter (1)',
    values[values.length - 1] === v1 && v1 === 1,
    `delivered=${values[values.length - 1]} server=${v1}`,
  )

  const cbBeforeMut2 = cbCount
  const v2 = await client.mutation(incrementCounter, { key })
  await waitUntil(() => cbCount > cbBeforeMut2)
  assert(
    'callback fired after mutation #2',
    cbCount > cbBeforeMut2,
    `cbCount ${cbBeforeMut2}->${cbCount}`,
  )
  assert(
    'delivered value == server counter (2)',
    values[values.length - 1] === v2 && v2 === 2,
    `delivered=${values[values.length - 1]} server=${v2}`,
  )

  // --- de-dup: a SECOND listener for the same (fn,args) => still ONE wire Add total ---
  let cb2Count = 0
  const unsub2 = client.onUpdate(getCounter, { key }, () => {
    cb2Count += 1
  })
  await waitUntil(() => cb2Count >= 1) // second listener gets current value from memory
  const afterSecondSub = countModifyQuerySet(rec)
  assert(
    'two listeners => still one wire Add (dedup)',
    afterSecondSub.add === 1,
    `add=${afterSecondSub.add}`,
  )

  // --- removing ONE listener leaves the other live (no wire Remove yet) ---
  unsub2()
  const afterRemoveOne = countModifyQuerySet(rec)
  assert(
    'removing one of two listeners emits no wire Remove',
    afterRemoveOne.remove === 0,
    `remove=${afterRemoveOne.remove}`,
  )

  const cbBeforeMut3 = cbCount
  const v3 = await client.mutation(incrementCounter, { key })
  await waitUntil(() => cbCount > cbBeforeMut3)
  assert(
    'surviving listener still delivers after partial unsub',
    cbCount > cbBeforeMut3 && values[values.length - 1] === v3,
    `delivered=${values[values.length - 1]} server=${v3}`,
  )

  // --- remove FINAL listener => exactly one wire Remove ---
  unsub()
  await waitUntil(() => countModifyQuerySet(rec).remove >= 1)
  const afterUnsubAll = countModifyQuerySet(rec)
  assert(
    'final unsubscribe emits exactly one wire Remove',
    afterUnsubAll.remove === 1,
    `remove=${afterUnsubAll.remove}`,
  )

  // --- after full unsubscribe, further mutation delivers ZERO further callbacks ---
  const frozenCb = cbCount
  const v4 = await client.mutation(incrementCounter, { key }) // server counter still advances
  await sleep(1500) // generous window for any stray delivery
  assert(
    'no callbacks after full unsubscribe',
    cbCount === frozenCb,
    `cbCount stayed ${frozenCb} (server counter now ${v4})`,
  )

  results.counts = {
    subscriptionCallbacks_total: cbCount,
    outgoingModifyQuerySet: countModifyQuerySet(rec),
    serverCounterFinal: v4,
  }

  await client.close()
  return results
}

main()
  .then((r) => {
    const failed = r.assertions.filter((a) => !a.pass)
    console.log(
      JSON.stringify(
        { proof: 'wire-fixture', verdict: failed.length === 0 ? 'PASS' : 'FAIL', ...r },
        null,
        2,
      ),
    )
    process.exit(failed.length === 0 ? 0 : 1)
  })
  .catch((e) => {
    console.log(
      JSON.stringify(
        { proof: 'wire-fixture', verdict: 'ERROR', error: String((e && e.stack) || e) },
        null,
        2,
      ),
    )
    process.exit(2)
  })
