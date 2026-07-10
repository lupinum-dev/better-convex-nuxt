// Ginko decision 12 (vNext §10.2) executable proof, using the INSTALLED defu
// (6.1.4) and replicating Nuxt 4.4.7 @nuxt/kit line 565-566 exactly:
//
//   nuxt.options[configKey] = defu(...overrides, nuxt.options[configKey], ...defaults)
//   isDisabled = configKey && !ignoredConfigKeys.has(configKey) && nuxt.options[configKey] === false
//
// configKey for better-convex-nuxt is `convex`. Ginko supplies only `defaults`
// (no overrides). The module-dependency default functions are registered ONLY
// when Ginko returns an entry containing `defaults`/`overrides`; if Ginko omits
// the entry, the defu line never runs for `convex`.
import { defu } from 'defu'

const studioRoute = '/studio'
const ginkoClientPath = '/abs/ginko/runtime/convex-auth'

// Ginko's §10.2 defaults, split by the decision:
//  - auth.client default is gated on the three fallback conditions;
//  - routeProtection.redirectTo is provided whenever auth is not disabled.
const ginkoDefaults = ({ withClientFallback }) => ({
  auth: {
    ...(withClientFallback ? { client: ginkoClientPath } : {}),
    routeProtection: { redirectTo: `${studioRoute}/auth/signin` },
  },
})

// Faithful model of the kit merge + disable check for the `convex` key.
// `ginkoEntry` === null models Ginko returning NO better-convex-nuxt entry.
function nuxtApplyConvexDependencyDefaults(hostConvex, ginkoEntry) {
  let convex = hostConvex
  if (ginkoEntry && (ginkoEntry.defaults || ginkoEntry.overrides)) {
    const overrides = ginkoEntry.overrides ? [ginkoEntry.overrides] : []
    const defaults = ginkoEntry.defaults ? [ginkoEntry.defaults] : []
    convex = defu(...overrides, convex, ...defaults) // line 565
  }
  const isDisabled = convex === false // line 566 (convex not in ignoredConfigKeys)
  return { convex, isDisabled }
}

// §10.2 decision: whether Ginko emits a better-convex-nuxt entry, and what
// `defaults` it carries. When hostConvex === false, emit NOTHING.
function ginkoDecision(hostConvex) {
  const hostAuth = hostConvex && typeof hostConvex === 'object' ? hostConvex.auth : undefined
  const authDisabled = hostConvex === false || hostAuth === false
  if (hostConvex === false) return null // <-- emit no entry at all
  const hasExplicitClient =
    hostAuth !== null &&
    typeof hostAuth === 'object' &&
    typeof hostAuth.client === 'string' &&
    hostAuth.client.length > 0
  const useGinkoClientFallback = !authDisabled && !hasExplicitClient
  // routeProtection default is independent; auth.client default is gated.
  return { defaults: ginkoDefaults({ withClientFallback: useGinkoClientFallback }) }
}

const results = []
const check = (name, pass, detail) => results.push({ name, pass, detail })

// --- Case 1: top-level convex:false + Ginko WRONGLY supplies defaults (old
//     behavior). defu(false, {...}) replaces false with the object -> module
//     installs against the host's off switch. Demonstrates the hazard. ---
{
  const wrongEntry = { defaults: ginkoDefaults({ withClientFallback: true }) }
  const { convex, isDisabled } = nuxtApplyConvexDependencyDefaults(false, wrongEntry)
  check(
    'HAZARD: defu(false, defaults) clobbers primitive false -> module NOT disabled',
    typeof convex === 'object' && convex !== null && isDisabled === false,
    { mergedType: typeof convex, isDisabled },
  )
}

// --- Case 2: top-level convex:false + §10.2 fix (Ginko emits no entry). No
//     merge runs; convex stays false; module disabled. ---
{
  const entry = ginkoDecision(false) // -> null
  const { convex, isDisabled } = nuxtApplyConvexDependencyDefaults(false, entry)
  check(
    'FIX: hostConvex=false + no Ginko entry -> convex stays false, module disabled',
    entry === null && convex === false && isDisabled === true,
    { entry, convex, isDisabled },
  )
}

// --- Case 3 (§5.8 re-verify on pinned defu 6.1.4): explicit NESTED auth:false
//     inside a convex OBJECT survives the merge. ---
{
  const hostConvex = { url: 'https://x.convex.cloud', auth: false }
  const entry = ginkoDecision(hostConvex)
  const { convex, isDisabled } = nuxtApplyConvexDependencyDefaults(hostConvex, entry)
  check(
    'nested auth:false preserved under defu (module installs, auth stays off)',
    convex.auth === false && isDisabled === false && convex.url === hostConvex.url,
    { auth: convex.auth, isDisabled },
  )
}

// --- Case 4: routeProtection.redirectTo default is INDEPENDENT of the client
//     fallback. Host owns auth.client; Ginko still injects routeProtection but
//     NOT its own client. ---
{
  const hostConvex = { auth: { client: './app-auth' } }
  const entry = ginkoDecision(hostConvex)
  const { convex } = nuxtApplyConvexDependencyDefaults(hostConvex, entry)
  check(
    'host-owned auth.client preserved; routeProtection default still applied',
    convex.auth.client === './app-auth' &&
      convex.auth.routeProtection?.redirectTo === `${studioRoute}/auth/signin` &&
      // Ginko did NOT override with its own client path
      !('client' in (entry.defaults.auth ?? {})),
    { client: convex.auth.client, redirectTo: convex.auth.routeProtection?.redirectTo },
  )
}

// --- Case 5: no host client + auth enabled -> Ginko client fallback applies. ---
{
  const hostConvex = { url: 'https://x.convex.cloud' }
  const entry = ginkoDecision(hostConvex)
  const { convex } = nuxtApplyConvexDependencyDefaults(hostConvex, entry)
  check(
    'no host client + auth enabled -> Ginko client fallback + routeProtection applied',
    convex.auth.client === ginkoClientPath &&
      convex.auth.routeProtection?.redirectTo === `${studioRoute}/auth/signin`,
    { client: convex.auth.client },
  )
}

for (const r of results)
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}\n        ${JSON.stringify(r.detail)}`)
const ok = results.every((r) => r.pass)
console.log(`\nDEFU DECISION-12 PROOF: ${ok ? 'PASS' : 'FAIL'}`)
process.exit(ok ? 0 : 1)
