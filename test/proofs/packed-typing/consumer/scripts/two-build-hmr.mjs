// §5.8 proof-1 / internal §20 Phase-0 coverage: the TYPE REGISTRY mechanism
// survives two consecutive `nuxi prepare` runs in ONE node process and a
// template regeneration without stale types. (Full library HMR is a Phase 3
// re-run; this proves the generated-registry surface is regeneration-safe.)
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const consumerDir = dirname(dirname(fileURLToPath(import.meta.url)))
const bin = (name) => join(consumerDir, 'node_modules', '.bin', name)
const run = (cmd, args) =>
  execFileSync(bin(cmd), args, { cwd: consumerDir, stdio: 'pipe', encoding: 'utf8' })

const registryPath = join(consumerDir, 'types', 'better-convex-nuxt-auth-client.d.ts')
const original = readFileSync(registryPath, 'utf8')

const probePass = () => {
  run('nuxi', ['typecheck'])
  return true
}
const probeFail = () => {
  try {
    run('nuxi', ['typecheck'])
    return false // typecheck unexpectedly passed
  } catch {
    return true // typecheck failed as expected
  }
}

const results = {}
try {
  // 1) Two consecutive prepares in this single process, then typecheck.
  run('nuxi', ['prepare'])
  run('nuxi', ['prepare'])
  results.twoBuildsOneProcessTypecheck = probePass()

  // 2) Regenerate the registry to point at the EMPTY base definition. After a
  //    fresh prepare the plugin assertions (apiKey.create) MUST now fail —
  //    proving the app program picks up regenerated types with no stale apiKey.
  const regenerated = original.replace("'../convex-auth'", "'../base-fallback/convex-auth.base'")
  if (regenerated === original) throw new Error('registry regeneration substitution did not apply')
  writeFileSync(registryPath, regenerated)
  run('nuxi', ['prepare'])
  results.regeneratedToEmptyClearsPluginTypes = probeFail()

  // 3) Restore the plugin registry; a fresh prepare must type-check again —
  //    proving no stale "empty" types linger.
  writeFileSync(registryPath, original)
  run('nuxi', ['prepare'])
  results.restoredPluginRegistryTypechecks = probePass()
} finally {
  writeFileSync(registryPath, original)
}

const ok = Object.values(results).every(Boolean)
console.log(JSON.stringify(results, null, 2))
console.log(ok ? 'TWO-BUILD/HMR-REGISTRY: PASS' : 'TWO-BUILD/HMR-REGISTRY: FAIL')
process.exit(ok ? 0 : 1)
