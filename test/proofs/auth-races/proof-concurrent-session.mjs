/**
 * CONCURRENT-SESSION fixture (internal §20 concurrent-session).
 *
 * Two independent tabs/clients for the SAME user (A). A token refresh in one
 * client must NOT invalidate the other's active subscription. Independent
 * ConvexClient instances own independent auth (audit fact); the proof drives a
 * live subscription on client2, refreshes client1's token, then mutates and
 * asserts client2's subscription is still live and keeps receiving updates.
 * Counts subscription updates.
 */
import { ConvexClient } from 'convex/browser'

function confirm(client, token, api, expectedSubject, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('confirm timeout')), timeoutMs)
    let done = false
    client.setAuth(
      async () => token,
      (isAuth) => {
        if (isAuth && !done) {
          done = true
          clearTimeout(timer)
          client.query(api.identityEcho, {}).then((id) => {
            if (id?.subject !== expectedSubject)
              reject(new Error(`subject ${id?.subject} != ${expectedSubject}`))
            else resolve(id)
          }, reject)
        }
      },
    )
  })
}

function waitFor(predicate, timeoutMs = 8000, interval = 25) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (predicate()) return resolve()
      if (Date.now() - start > timeoutMs) return reject(new Error('waitFor timeout'))
      setTimeout(tick, interval)
    }
    tick()
  })
}

export async function run({ convexUrl, api, tokens }) {
  const key = `proof-concurrent-${Date.now()}`
  const log = []

  const client1 = new ConvexClient(convexUrl, { unsavedChangesWarning: false }) // "tab 1"
  const client2 = new ConvexClient(convexUrl, { unsavedChangesWarning: false }) // "tab 2"

  await confirm(client1, tokens.A.token, api, tokens.A.userId)
  await confirm(client2, tokens.A.token, api, tokens.A.userId)
  log.push('both tabs authed as A')

  // client2 holds an ACTIVE subscription to the counter.
  let client2Updates = 0
  let lastValue = null
  const seen = []
  const unsub = client2.onUpdate(api.getCounter, { key }, (value) => {
    client2Updates += 1
    lastValue = value
    seen.push(value)
  })

  // Wait for the initial subscription value (counter starts at 0).
  await waitFor(() => client2Updates >= 1)
  const updatesBeforeRefresh = client2Updates
  log.push(`client2 subscription initial value=${lastValue} (updates=${updatesBeforeRefresh})`)

  // client1 performs a TOKEN REFRESH (same user A, rotated token). This must
  // not disturb client2's independent auth or its active subscription.
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('refresh confirm timeout')), 8000)
    let done = false
    client1.setAuth(
      async () => tokens.Afresh.token,
      (isAuth) => {
        if (isAuth && !done) {
          done = true
          clearTimeout(timer)
          resolve()
        }
      },
    )
  })
  log.push('client1 refreshed token (A → fresh-A)')

  // Now mutate via client1; client2's subscription must observe the new value,
  // proving it survived the other tab's refresh.
  const newValue = await client1.mutation(api.incrementCounter, { key, by: 1 })
  log.push(`client1 incremented counter → ${newValue}`)

  await waitFor(() => client2Updates > updatesBeforeRefresh)
  const updatesAfterRefresh = client2Updates
  const finalSubValue = lastValue
  log.push(
    `client2 subscription observed update after client1 refresh: value=${finalSubValue} (updates=${updatesAfterRefresh})`,
  )

  // client2's own identity must still be A (untouched by client1's refresh).
  const client2Identity = await client2.query(api.identityEcho, {})

  unsub()
  await client1.close()
  await client2.close()

  const pass =
    updatesBeforeRefresh >= 1 &&
    updatesAfterRefresh > updatesBeforeRefresh && // subscription still live after other tab refreshed
    finalSubValue === newValue &&
    client2Identity?.subject === tokens.A.userId

  return {
    proof: 'proof-concurrent-session',
    pass,
    counts: {
      client2UpdatesBeforeRefresh: updatesBeforeRefresh,
      client2UpdatesAfterRefresh: updatesAfterRefresh,
      client2UpdatesDelta: updatesAfterRefresh - updatesBeforeRefresh,
    },
    counterValueAfterIncrement: newValue,
    client2ObservedValue: finalSubValue,
    client2IdentitySubject: client2Identity?.subject,
    expectedSubject: tokens.A.userId,
    log,
  }
}
