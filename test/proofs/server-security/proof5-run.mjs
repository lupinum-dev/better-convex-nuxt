// Proof 5 runner — BOUNDARY SANITIZATION (vNext.md §5.8 proof 5 / §9).
// Spawns each worker as a child process, captures the ENTIRE stdout+stderr,
// and scans for the sentinel secret. This is the captured-output evidence.
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const child = join(here, 'proof5-child.mjs')

// Unique sentinel per run so a stale build artifact can never produce a false pass.
const SENTINEL = `SENTINEL_${randomBytes(9).toString('hex').toUpperCase()}`

function run({ scenario, wrapped, logger, port }) {
  const a = [
    child,
    `--scenario=${scenario}`,
    `--wrapped=${wrapped}`,
    `--logger=${logger}`,
    `--port=${port}`,
    `--sentinel=${SENTINEL}`,
  ]
  const r = spawnSync(process.execPath, a, { encoding: 'utf8' })
  const combined = (r.stdout || '') + (r.stderr || '')
  return { combined, code: r.status }
}

function countSentinel(text) {
  return text.split(SENTINEL).length - 1
}

const assertions = []
function assert(name, pass, detail) {
  assertions.push({ name, pass, detail })
}

// --- 1. Leak-control: prove the mock actually serves the sentinel via BOTH
//        channels when unsanitized (body-in-message and logLines). ---
const ctlBody = run({ scenario: 'leak-body', wrapped: false, logger: 'default', port: 4650 })
assert(
  'leak-control/body: raw Error.message DOES contain sentinel (channel is real)',
  countSentinel(ctlBody.combined) >= 3, // query+mutation+action
  `sentinelCount=${countSentinel(ctlBody.combined)} (expect >=3)`,
)

const ctlLogs = run({ scenario: 'loglines', wrapped: false, logger: 'default', port: 4651 })
assert(
  'leak-control/logLines: default logger DOES print sentinel to console (channel is real)',
  countSentinel(ctlLogs.combined) >= 3,
  `sentinelCount=${countSentinel(ctlLogs.combined)} (expect >=3)`,
)

// --- 2. SANITIZED: body-in-message channel, wrapper + logger:false. ---
const sanBody = run({ scenario: 'leak-body', wrapped: true, logger: 'false', port: 4652 })
assert(
  'proof5/body: sentinel ABSENT from all sanitized output (message, toJSON, inspect, payload, logs)',
  countSentinel(sanBody.combined) === 0,
  `sentinelCount=${countSentinel(sanBody.combined)} (expect 0)`,
)
const bodyWrappedCount = (sanBody.combined.match(/outcome=wrapped kind=unknown/g) || []).length
assert(
  'proof5/body: all three ops (query,mutation,action) reclassified to opaque kind=unknown',
  bodyWrappedCount === 3,
  `unknownCount=${bodyWrappedCount} (expect 3)`,
)
assert(
  'proof5/body: public message is the generic boundary error only',
  (sanBody.combined.match(/message=<<Convex server call failed>>/g) || []).length === 3,
  `genericMsgCount=${(sanBody.combined.match(/message=<<Convex server call failed>>/g) || []).length} (expect 3)`,
)
assert(
  'proof5/body: raw cause is retained (non-enumerable) for out-of-band debugging',
  (sanBody.combined.match(/CAUSE_RETAINED op=\w+ true/g) || []).length === 3,
  `causeRetainedCount=${(sanBody.combined.match(/CAUSE_RETAINED op=\w+ true/g) || []).length} (expect 3)`,
)

// --- 3. SANITIZED: logLines channel silenced by logger:false. ---
const sanLogs = run({ scenario: 'loglines', wrapped: true, logger: 'false', port: 4653 })
assert(
  'proof5/logLines: sentinel ABSENT once logger:false suppresses the logLines channel',
  countSentinel(sanLogs.combined) === 0,
  `sentinelCount=${countSentinel(sanLogs.combined)} (expect 0)`,
)

// --- 4. Legit ConvexError path still surfaces structured data as `server`. ---
const legit = run({ scenario: 'convex-error', wrapped: true, logger: 'false', port: 4654 })
assert(
  'proof5/contract: legit ConvexError reclassified to kind=server (not opaque)',
  (legit.combined.match(/serverKind=true/g) || []).length === 3,
  `serverKindCount=${(legit.combined.match(/serverKind=true/g) || []).length} (expect 3)`,
)
assert(
  'proof5/contract: structured data.code=UNAUTHORIZED preserved through sanitization',
  (legit.combined.match(/dataCode=UNAUTHORIZED/g) || []).length === 3,
  `dataCodeCount=${(legit.combined.match(/dataCode=UNAUTHORIZED/g) || []).length} (expect 3)`,
)
assert(
  'proof5/contract: data.reason preserved (full structured payload intact)',
  (legit.combined.match(/dataReason=insufficient role/g) || []).length === 3,
  `count=${(legit.combined.match(/dataReason=insufficient role/g) || []).length} (expect 3)`,
)

// --- Report ---
let allPass = true
console.log(`\n=== PROOF 5: SERVER BOUNDARY SANITIZATION ===`)
console.log(`sentinel=${SENTINEL}\n`)
for (const { name, pass, detail } of assertions) {
  if (!pass) allPass = false
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}\n        ${detail}`)
}
console.log(`\nPROOF 5 VERDICT: ${allPass ? 'PASS' : 'FAIL'}`)
process.exit(allPass ? 0 : 1)
