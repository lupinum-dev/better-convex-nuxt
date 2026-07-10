/**
 * PROOF 6 — SERIAL SIGN-IN CONFIRMATION (vNext §5.8 proof 6 / §5.3).
 *
 * Concurrent token-bearing sign-in candidates are driven through a PROTOTYPE
 * serial identity-operation queue over real ConvexClient instances. Each
 * candidate resolves only after ITS identity is confirmed by Convex
 * (onChange(true) confirmed-auth callback AND identityEcho returns its
 * subject). Candidates are enqueued concurrently (invocation order A, B, C=fresh-A);
 * the queue must run them serially in invocation order and leave the LAST
 * candidate (C) as the final identity. Exactly one Convex confirmation per
 * candidate.
 */
import { ConvexClient } from 'convex/browser'

/**
 * Prototype serial identity-operation queue (vNext §5.3: "one per-Nuxt-app
 * serial identity-operation queue; concurrent calls execute in invocation
 * order"). Deliberately minimal — proves the mechanic, not the final API.
 */
function createSerialQueue() {
  let tail = Promise.resolve()
  return function enqueue(op) {
    const run = tail.then(op, op)
    // keep the chain alive regardless of individual op outcome
    tail = run.then(
      () => {},
      () => {},
    )
    return run
  }
}

export async function run({ convexUrl, api, tokens }) {
  const log = []
  const client = new ConvexClient(convexUrl, { unsavedChangesWarning: false })

  let confirmations = 0
  const runOrder = []
  const confirmedSubjects = []

  // Confirm a candidate on the shared primary client: setAuth, await the
  // confirmed-auth callback (onChange(true)), then verify identity via Convex.
  async function confirmCandidate(label, token, expectedSubject) {
    runOrder.push(label)
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`confirm ${label} timed out`)), 8000)
      let settled = false
      client.setAuth(
        async () => token,
        (isAuthenticated) => {
          if (isAuthenticated && !settled) {
            settled = true
            clearTimeout(timer)
            resolve()
          }
        },
      )
    })
    // Independent Convex confirmation: identityEcho must return THIS subject.
    const identity = await client.query(api.identityEcho, {})
    if (!identity || identity.subject !== expectedSubject) {
      throw new Error(
        `identityEcho for ${label} returned ${JSON.stringify(identity)} expected subject=${expectedSubject}`,
      )
    }
    confirmations += 1
    confirmedSubjects.push({ label, subject: identity.subject })
    log.push(`[${label}] confirmed subject=${identity.subject} (confirmation #${confirmations})`)
  }

  const enqueue = createSerialQueue()

  // Candidates: A, B, C (=fresh-A). Enqueue CONCURRENTLY in invocation order.
  const candidates = [
    ['A', tokens.A.token, tokens.A.userId],
    ['B', tokens.B.token, tokens.B.userId],
    ['C', tokens.Afresh.token, tokens.Afresh.userId],
  ]

  const promises = candidates.map(([label, token, subject]) =>
    enqueue(() => confirmCandidate(label, token, subject)),
  )
  await Promise.all(promises)

  // Final identity = last candidate (C).
  const finalIdentity = await client.query(api.identityEcho, {})
  await client.close()

  const invocationOrder = candidates.map((c) => c[0]).join(',')
  const observedOrder = runOrder.join(',')
  const finalSubject = finalIdentity?.subject
  const lastCandidateSubject = candidates[candidates.length - 1][2]

  const pass =
    observedOrder === invocationOrder &&
    confirmations === candidates.length &&
    finalSubject === lastCandidateSubject

  return {
    proof: 'proof6-serial-signin',
    pass,
    counts: {
      candidates: candidates.length,
      confirmations,
      confirmationsPerCandidate: confirmations / candidates.length,
    },
    invocationOrder,
    observedOrder,
    finalSubject,
    lastCandidateSubject,
    confirmedSubjects,
    log,
  }
}
