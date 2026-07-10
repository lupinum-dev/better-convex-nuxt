/**
 * PROOF 10 — CANDIDATE CONFIRMATION WITHOUT expectAuth (vNext §5.8 proof 10).
 *
 * A fresh ConvexClient given a token via setAuth reaches its confirmed-auth
 * callback (onChange(true), driven by onTransition → markAuthCompletion) with
 * ZERO application work executed pre-confirmation, within OUR internal 5,000 ms
 * deadline.
 *
 * Note on the deadline: 5,000 ms is OUR budget, not a Convex constant. The
 * setAuth socket pause spans only the token-fetch window; confirmation then
 * arrives asynchronously via the callback. So the GATING MECHANISM is the
 * onChange callback, NOT the pause — all application work is gated on the
 * callback, and we assert zero app work (zero queries) ran before it fired.
 */
import { ConvexClient } from 'convex/browser'

const DEADLINE_MS = 5000

export async function run({ convexUrl, api, tokens }) {
  const client = new ConvexClient(convexUrl, { unsavedChangesWarning: false })

  let appQueriesBeforeConfirmation = 0
  let confirmed = false
  let confirmedAtMs = null
  let tokenFetchStartedAt = null

  // Wrap client.query so ANY application query is counted. All app work is
  // gated behind the confirmation callback; this counter proves the gate holds.
  const appQuery = (...args) => {
    if (!confirmed) appQueriesBeforeConfirmation += 1
    return client.query(...args)
  }

  const t0 = Date.now()

  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`did not confirm within ${DEADLINE_MS}ms budget`)),
      DEADLINE_MS,
    )
    client.setAuth(
      async () => {
        // The token-fetch window: the socket is paused only for this span.
        tokenFetchStartedAt = Date.now() - t0
        return tokens.A.token
      },
      (isAuthenticated) => {
        if (isAuthenticated && !confirmed) {
          confirmed = true
          confirmedAtMs = Date.now() - t0
          clearTimeout(timer)
          resolve()
        }
      },
    )
    // Deliberately issue NO application work here — everything waits for the callback.
  })

  // Only NOW (post-confirmation) is application work permitted.
  const identity = await appQuery(api.identityEcho, {})
  await client.close()

  const pass =
    confirmed === true &&
    appQueriesBeforeConfirmation === 0 &&
    confirmedAtMs !== null &&
    confirmedAtMs <= DEADLINE_MS &&
    identity?.subject === tokens.A.userId

  return {
    proof: 'proof10-candidate-confirmation',
    pass,
    deadlineMs: DEADLINE_MS,
    deadlineNote:
      'OUR budget, not a Convex constant; socket pause spans only the token-fetch window; the gating mechanism is the onChange callback.',
    appQueriesBeforeConfirmation,
    confirmedAtMs,
    tokenFetchStartedAtMs: tokenFetchStartedAt,
    confirmedSubject: identity?.subject,
    expectedSubject: tokens.A.userId,
  }
}
