/**
 * vNext §5.8 proof 11 — onUpdate rebinding (Opus-tier).
 *
 * Proves, against the LIVE local Convex deployment with two real
 * ConvexClients (A-identity, then replacement B-identity), that the prototype
 * ConvexClientHandle (§5.4) rebinds active onUpdate listeners A->B with a
 * stable unsubscribe identity, no stale A-era emission, exactly one
 * Convex-side subscription per listener, and clean teardown.
 *
 * Run (repo root, local convex backend up per proofs-harness.md §1):
 *   node test/proofs/onupdate-rebinding/onupdate-rebinding.proof.mjs
 */
import { ConvexClient } from 'convex/browser'
import { anyApi } from 'convex/server'

import { bootPlaygroundServer, acquireToken } from '../support/acquire-token.mjs'
import { createPrototypeHandle } from './handle.mjs'

const PORT = 4630
const CONVEX_URL = process.env.CONVEX_URL ?? 'http://127.0.0.1:3210'
const COUNTER_KEY = `onupdate-rebind-${Date.now()}`

const identityEcho = anyApi.proofSupport.identityEcho
const getCounter = anyApi.proofSupport.getCounter
const incrementCounter = anyApi.proofSupport.incrementCounter

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitFor(predicate, { timeout = 8000, label = 'condition' } = {}) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    if (predicate()) return
    await sleep(40)
  }
  throw new Error(`waitFor timeout: ${label}`)
}

function setAuthAndConfirm(client, token, { timeout = 8000, label } = {}) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`auth-confirm timeout: ${label}`)), timeout)
    client.setAuth(
      async () => token,
      (isAuthenticated) => {
        if (isAuthenticated) {
          clearTimeout(t)
          resolve()
        }
      },
    )
  })
}

const checks = []
function check(name, cond, detail = '') {
  checks.push({ name, pass: !!cond, detail })
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

function counts(client, tag) {
  const c = {
    listeners: client.listeners?.size,
    querySet: client.client?.state?.querySet?.size,
  }
  console.log(`[counts:${tag}] listeners=${c.listeners} querySet=${c.querySet}`)
  return c
}

async function main() {
  const server = await bootPlaygroundServer({ port: PORT })
  const clientA = new ConvexClient(CONVEX_URL, { unsavedChangesWarning: false })
  let clientB = null
  try {
    const userA = await acquireToken({
      baseUrl: server.baseUrl,
      email: 'proof-a@example.test',
      password: 'Password123!',
      name: 'Proof A',
    })
    const userB = await acquireToken({
      baseUrl: server.baseUrl,
      email: 'proof-b@example.test',
      password: 'Password123!',
      name: 'Proof B',
    })
    check(
      'users A and B are distinct non-null identities',
      userA.userId && userB.userId && userA.userId !== userB.userId,
      `A=${userA.userId} B=${userB.userId}`,
    )

    await setAuthAndConfirm(clientA, userA.token, { label: 'A' })

    const handle = createPrototypeHandle(clientA)

    // Consumer state ------------------------------------------------------
    let phase = 'A'
    const echoLog = [] // { subject, phase }
    const counterLog = [] // { v, phase }
    const echoErrors = []
    const counterErrors = []

    const unsubEcho = handle.onUpdate(
      identityEcho,
      {},
      (r) => echoLog.push({ subject: r?.subject ?? null, phase }),
      (e) => echoErrors.push({ e: String(e), phase }),
    )
    const unsubCounter = handle.onUpdate(
      getCounter,
      { key: COUNTER_KEY },
      (v) => counterLog.push({ v, phase }),
      (e) => counterErrors.push({ e: String(e), phase }),
    )

    // Capture the SAME unsubscribe object references before any rebind.
    const stableEchoRef = unsubEcho
    const stableCounterRef = unsubCounter

    // Initial emissions under A ------------------------------------------
    await waitFor(() => echoLog.some((e) => e.subject === userA.userId), {
      label: 'echo initial A',
    })
    await waitFor(() => counterLog.some((c) => c.v === 0), { label: 'counter initial 0' })
    counts(clientA, 'A after subscribe')
    check(
      'under A, echo callback observes subject === A',
      echoLog.every((e) => e.phase !== 'A' || e.subject === userA.userId),
      `A-phase echo subjects=${JSON.stringify([...new Set(echoLog.filter((e) => e.phase === 'A').map((e) => e.subject))])}`,
    )

    // A-era write: increments the counter while identity is A -----------
    await handle.mutation(incrementCounter, { key: COUNTER_KEY })
    await waitFor(() => counterLog.some((c) => c.v === 1), { label: 'counter A write -> 1' })
    check(
      'under A, live counter update delivered (0 -> 1)',
      counterLog.some((c) => c.phase === 'A' && c.v === 1),
    )

    const cA_before_rebind = counts(clientA, 'A before rebind')
    check(
      'client A has exactly 2 active listeners before rebind',
      cA_before_rebind.listeners === 2,
      `listeners=${cA_before_rebind.listeners}`,
    )

    // ===================== REBIND A -> B ==============================
    clientB = new ConvexClient(CONVEX_URL, { unsavedChangesWarning: false })
    await setAuthAndConfirm(clientB, userB.token, { label: 'B' })

    const echoLen_at_rebind = echoLog.length
    const counterLen_at_rebind = counterLog.length

    handle.__rebind(clientB)
    phase = 'B'

    // (1) stable unsubscribe identity across replacement
    check(
      'unsubscribe object identity is STABLE across A->B rebind',
      unsubEcho === stableEchoRef && unsubCounter === stableCounterRef,
    )

    // detached from A on rebind (before A is even closed)
    const cA_after_rebind = counts(clientA, 'A after rebind (pre-close)')
    check(
      'rebind detached ALL listeners from client A (A listeners == 0)',
      cA_after_rebind.listeners === 0,
      `A listeners=${cA_after_rebind.listeners}`,
    )

    // Retire the A client.
    await clientA.close()
    check('client A is closed after retirement', clientA.closed === true)

    // (2) listeners rebound to B: fresh emission carries B identity, NO stale A
    await waitFor(() => echoLog.slice(echoLen_at_rebind).some((e) => e.subject === userB.userId), {
      label: 'echo rebound to B',
    })
    await waitFor(() => counterLog.length > counterLen_at_rebind, {
      label: 'counter re-emits on B',
    })

    const postRebindEcho = echoLog.slice(echoLen_at_rebind)
    check(
      'after rebind, every echo emission carries subject === B (rebound to B client)',
      postRebindEcho.length > 0 && postRebindEcho.every((e) => e.phase === 'B'),
    )
    check(
      'after rebind, ZERO stale A-era emissions (no echo entry with subject === A)',
      postRebindEcho.every((e) => e.subject !== userA.userId),
      `post-rebind subjects=${JSON.stringify([...new Set(postRebindEcho.map((e) => e.subject))])}`,
    )

    const cB_after_rebind = counts(clientB, 'B after rebind')
    check(
      'exactly one Convex-side subscription per listener on B (2 listeners, 2 queries)',
      cB_after_rebind.listeners === 2 && cB_after_rebind.querySet === 2,
      `listeners=${cB_after_rebind.listeners} querySet=${cB_after_rebind.querySet}`,
    )

    // (2b) no double-delivery: one mutation -> exactly one counter callback
    await waitFor(() => counterLog.slice(counterLen_at_rebind).some((c) => c.phase === 'B'), {
      label: 'counter settled on B',
    })
    await sleep(400) // let any straggler initial replays land before we baseline
    const counterLen_settled = counterLog.length
    await handle.mutation(incrementCounter, { key: COUNTER_KEY })
    await waitFor(() => counterLog.length > counterLen_settled, { label: 'B write delivered' })
    await sleep(900) // grace window to catch any accidental double-delivery
    const deltaOneWrite = counterLog.length - counterLen_settled
    check(
      'single mutation after rebind delivers EXACTLY ONE callback (no double-delivery)',
      deltaOneWrite === 1,
      `callbacks delivered for 1 write = ${deltaOneWrite}`,
    )
    const lastVal = counterLog[counterLog.length - 1]?.v
    check(
      'B-era counter value continues from A-era state (value === 2)',
      lastVal === 2,
      `last value=${lastVal}`,
    )

    // (1b) stable unsubscribe (captured pre-rebind) still detaches post-rebind
    const cB_before_echo_unsub = clientB.listeners.size
    stableEchoRef() // the SAME object captured before rebind
    const cB_after_echo_unsub = counts(clientB, 'B after stable-echo unsubscribe')
    check(
      'stable unsubscribe (captured pre-rebind) detaches the CURRENT (B) subscription',
      cB_before_echo_unsub === 2 && cB_after_echo_unsub.listeners === 1,
      `B listeners ${cB_before_echo_unsub} -> ${cB_after_echo_unsub.listeners}`,
    )

    // (3) teardown: after unsubscribe, further mutations deliver zero callbacks
    const counterLen_before_teardown = counterLog.length
    unsubCounter()
    check(
      'after counter unsubscribe, B has 0 listeners',
      clientB.listeners.size === 0,
      `listeners=${clientB.listeners.size}`,
    )
    await handle.mutation(incrementCounter, { key: COUNTER_KEY })
    await sleep(900)
    const deltaAfterUnsub = counterLog.length - counterLen_before_teardown
    check(
      'after unsubscribe, further mutations deliver ZERO callbacks',
      deltaAfterUnsub === 0,
      `stray callbacks=${deltaAfterUnsub}`,
    )

    // (3b) after handle disposal, zero listeners remain on either client
    handle.__dispose()
    const cB_final = counts(clientB, 'B after dispose')
    check('handle disposal leaves ZERO active handle listeners', handle.__activeCount() === 0)
    check(
      'handle disposal leaves ZERO listeners on B (querySet 0)',
      cB_final.listeners === 0 && cB_final.querySet === 0,
      `listeners=${cB_final.listeners} querySet=${cB_final.querySet}`,
    )
    check(
      'client A (retired) has ZERO listeners',
      clientA.listeners.size === 0,
      `listeners=${clientA.listeners.size}`,
    )

    check(
      'no error-path emissions on either subscription',
      echoErrors.length === 0 && counterErrors.length === 0,
      `echoErrors=${echoErrors.length} counterErrors=${counterErrors.length}`,
    )

    // ---------------------------------------------------------------
    const failed = checks.filter((c) => !c.pass)
    console.log('\n==== SUMMARY ====')
    console.log(
      `total=${checks.length} passed=${checks.length - failed.length} failed=${failed.length}`,
    )
    if (failed.length) {
      console.log('FAILED:', failed.map((f) => f.name).join(' | '))
      process.exitCode = 1
    } else {
      console.log('VERDICT: PASS')
    }
  } finally {
    try {
      await clientA.close()
    } catch {
      // best-effort teardown; a retired client may already be closed
    }
    try {
      if (clientB) await clientB.close()
    } catch {
      // best-effort teardown; a retired client may already be closed
    }
    await server.release()
  }
}

main().catch((e) => {
  console.error('PROOF ERRORED:', e)
  process.exitCode = 1
})
