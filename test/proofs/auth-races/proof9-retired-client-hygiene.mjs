/**
 * PROOF 9 — RETIRED-CLIENT HYGIENE (vNext §5.8 proof 9).
 *
 * Three assertions:
 * (a) Closing a client with an in-flight mutation: the consumer-held promise
 *     must be REJECTED with IDENTITY_CHANGED by the PROTOTYPE retirement
 *     wrapper. Re-verify that raw close() leaves the underlying mutation
 *     promise HANGING (unsettled) — the wrapper owns the rejection.
 * (b) unsavedChangesWarning:false arms no unsaved-changes dialog (no
 *     beforeunload listener registered even when window exists).
 * (c) Across N sign-in/out retirement cycles, ACCUMULATED beforeunload
 *     listeners == 0 (instrumented addEventListener). Also demonstrates the
 *     raw hazard: default options DO accumulate and close() removes none.
 */
import { ConvexClient } from 'convex/browser'

// Prototype IDENTITY_CHANGED error (vNext §5.4:
// ConvexCallError({ kind: 'authentication', code: 'IDENTITY_CHANGED' })).
class ConvexCallErrorProto extends Error {
  constructor({ kind, code, message }) {
    super(message ?? code)
    this.kind = kind
    this.code = code
  }
}
const makeIdentityChanged = () =>
  new ConvexCallErrorProto({
    kind: 'authentication',
    code: 'IDENTITY_CHANGED',
    message: 'identity changed',
  })

/**
 * Prototype retirement wrapper. Wraps an in-flight mutation promise so the
 * CONSUMER-held promise rejects with IDENTITY_CHANGED the moment the client is
 * retired, regardless of whether the raw underlying promise ever settles.
 */
function retireable(rawInflight) {
  let rejectRetire
  const retiredSignal = new Promise((_, reject) => {
    rejectRetire = reject
  })
  // Swallow the raw promise's eventual (non-)settlement so it can't surface as
  // an unhandled rejection after retirement.
  rawInflight.then(
    () => {},
    () => {},
  )
  const consumerPromise = Promise.race([rawInflight, retiredSignal])
  return {
    consumerPromise,
    retire: async (client) => {
      rejectRetire(makeIdentityChanged())
      await client.close()
    },
  }
}

async function partA({ convexUrl, api }) {
  // --- Raw close() re-verification: in-flight mutation promise hangs. ---
  const rawClient = new ConvexClient(convexUrl, { unsavedChangesWarning: false })
  // Start a mutation and DO NOT await; close immediately so it is in-flight.
  const rawMutation = rawClient.mutation(api.incrementCounter, {
    key: `proof9-raw-${Date.now()}`,
    by: 1,
  })
  const rawInflightState = { settled: false }
  rawMutation.then(
    () => {
      rawInflightState.settled = true
    },
    () => {
      rawInflightState.settled = true
    },
  )
  await rawClient.close()
  // Give it 1500ms to (not) settle.
  await new Promise((r) => setTimeout(r, 1500))
  const rawStillHanging = rawInflightState.settled === false
  // Prevent a late unhandled-rejection from the raw promise.
  rawMutation.catch(() => {})

  // --- Retirement wrapper: consumer promise rejects with IDENTITY_CHANGED. ---
  const client = new ConvexClient(convexUrl, { unsavedChangesWarning: false })
  const inflight = client.mutation(api.incrementCounter, {
    key: `proof9-wrap-${Date.now()}`,
    by: 1,
  })
  const { consumerPromise, retire } = retireable(inflight)
  // Attach the consumer's outcome handler BEFORE retiring, so the rejection is
  // never momentarily unhandled.
  const caught = consumerPromise.then(
    () => null,
    (err) => err,
  )
  // Retire immediately (identity change) while the mutation is in flight.
  await retire(client)
  const rejectedWith = await caught
  const rejectedIdentityChanged =
    rejectedWith instanceof ConvexCallErrorProto &&
    rejectedWith.code === 'IDENTITY_CHANGED' &&
    rejectedWith.kind === 'authentication'

  return {
    rawStillHanging,
    rejectedIdentityChanged,
    rejectedCode: rejectedWith?.code ?? null,
    rejectedKind: rejectedWith?.kind ?? null,
  }
}

async function partBC({ convexUrl }) {
  const N = 5
  // Instrument a fake window so ConvexClient's beforeunload registration path
  // is exercised (in Node there is no window, so the listener code is dormant;
  // the vNext design must hold when a window DOES exist — the browser).
  const beforeunloadListeners = new Set()
  const savedWindow = globalThis.window
  globalThis.window = {
    addEventListener: (type, handler) => {
      if (type === 'beforeunload') beforeunloadListeners.add(handler)
    },
    removeEventListener: (type, handler) => {
      if (type === 'beforeunload') beforeunloadListeners.delete(handler)
    },
    event: {},
  }

  let designCount = 0 // unsavedChangesWarning:false across N cycles
  let hazardCount = 0 // default options across N cycles

  try {
    // DESIGN: every sign-in/out cycle constructs with unsavedChangesWarning:false.
    for (let i = 0; i < N; i++) {
      const c = new ConvexClient(convexUrl, { unsavedChangesWarning: false })
      await c.close()
    }
    designCount = beforeunloadListeners.size

    // HAZARD demonstration: default options (window present) register a
    // beforeunload listener per client, and close() removes none → accumulate.
    beforeunloadListeners.clear()
    const hazardClients = []
    for (let i = 0; i < N; i++) {
      const c = new ConvexClient(convexUrl) // no unsavedChangesWarning → registers listener
      hazardClients.push(c)
      await c.close() // close() does NOT remove the beforeunload listener
    }
    hazardCount = beforeunloadListeners.size
  } finally {
    if (savedWindow === undefined) delete globalThis.window
    else globalThis.window = savedWindow
  }

  return {
    N,
    designBeforeunloadAccumulated: designCount,
    hazardBeforeunloadAccumulated: hazardCount,
  }
}

export async function run({ convexUrl, api }) {
  const a = await partA({ convexUrl, api })
  const bc = await partBC({ convexUrl })

  const pass =
    a.rawStillHanging === true &&
    a.rejectedIdentityChanged === true &&
    bc.designBeforeunloadAccumulated === 0 &&
    bc.hazardBeforeunloadAccumulated === bc.N // hazard confirms the instrument works

  return {
    proof: 'proof9-retired-client-hygiene',
    pass,
    rawCloseLeavesMutationHanging: a.rawStillHanging,
    wrapperRejectsIdentityChanged: a.rejectedIdentityChanged,
    rejectedCode: a.rejectedCode,
    rejectedKind: a.rejectedKind,
    cycles: bc.N,
    designBeforeunloadAccumulated: bc.designBeforeunloadAccumulated,
    hazardBeforeunloadAccumulated: bc.hazardBeforeunloadAccumulated,
    note: 'unsavedChangesWarning:false arms no dialog AND registers no beforeunload listener; hazard column proves the instrument counts real registrations and that raw close() removes none.',
  }
}
