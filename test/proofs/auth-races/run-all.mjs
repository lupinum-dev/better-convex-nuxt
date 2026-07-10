/**
 * AUTH RACES proof group runner (vNext §5.8 proofs 6, 8, 9, 10 + internal §20
 * total-token-fetcher / transient-retry / concurrent-session).
 *
 * Boots the playground server once (port 4620), acquires real tokens, and runs
 * every proof against the live local Convex deployment. Prints a per-proof
 * PASS/FAIL verdict with the demanded counts, then exits non-zero if any fail.
 *
 * Run with: node --expose-gc test/proofs/auth-races/run-all.mjs
 */
import { setup } from './_shared.mjs'
import { run as proofConcurrent } from './proof-concurrent-session.mjs'
import { run as proofFetcher } from './proof-total-fetcher-retry.mjs'
import { run as proof6 } from './proof6-serial-signin.mjs'
import { run as proof8 } from './proof8-epoch-refresh-dedup.mjs'
import { run as proof9 } from './proof9-retired-client-hygiene.mjs'
import { run as proof10 } from './proof10-candidate-confirmation.mjs'

const only = process.argv[2] // optional: run a single proof by name substring

const proofs = [
  ['proof6', proof6],
  ['proof8', proof8],
  ['proof10', proof10],
  ['proof9', proof9],
  ['fetcher', proofFetcher],
  ['concurrent', proofConcurrent],
]

const ctx = await setup()
console.log('== AUTH RACES proof group ==')
console.log('convexUrl:', ctx.convexUrl)
console.log('A.userId:', ctx.tokens.A.userId, '| B.userId:', ctx.tokens.B.userId)
console.log(
  'Afresh.userId:',
  ctx.tokens.Afresh.userId,
  '| Afresh token differs from A:',
  ctx.tokens.Afresh.token !== ctx.tokens.A.token,
)
console.log('')

const results = []
for (const [name, fn] of proofs) {
  if (only && !name.includes(only)) continue
  try {
    const r = await fn(ctx)
    results.push(r)
    console.log(`### ${r.proof}: ${r.pass ? 'PASS' : 'FAIL'}`)
    console.log(JSON.stringify(r, null, 2))
    console.log('')
  } catch (err) {
    results.push({ proof: name, pass: false, error: String((err && err.stack) || err) })
    console.log(`### ${name}: FAIL (threw)`)
    console.log(String((err && err.stack) || err))
    console.log('')
  }
}

const failed = results.filter((r) => !r.pass)
console.log('== SUMMARY ==')
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.proof}`)
console.log(`${results.length - failed.length}/${results.length} passed`)

// Best-effort, time-boxed teardown (the Nitro child can be slow to exit; it
// must not gate the verdict or the exit code).
await Promise.race([ctx.release(), new Promise((r) => setTimeout(r, 3000))])
process.exit(failed.length ? 1 : 0)
