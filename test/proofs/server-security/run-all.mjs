// Runs the full SERVER SECURITY proof group (vNext.md §5.8 proofs 5 & 7).
//   node test/proofs/server-security/run-all.mjs
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const steps = [
  ['Proof 5 — boundary sanitization', 'proof5-run.mjs'],
  ['Proof 7 — exchange redirect safety', 'proof7-run.mjs'],
  ['Proof 7 supplement — undici redirect contract', 'proof7-undici-probe.mjs'],
]
let ok = true
for (const [label, file] of steps) {
  console.log(`\n########## ${label} ##########`)
  const r = spawnSync(process.execPath, [join(here, file)], { stdio: 'inherit' })
  if (r.status !== 0) ok = false
}
console.log(`\n########## GROUP VERDICT: ${ok ? 'ALL PASS' : 'FAILURE'} ##########`)
process.exit(ok ? 0 : 1)
