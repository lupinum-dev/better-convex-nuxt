# Lifecycle / two-app / HMR harnesses (internal §17.3, §20 Phase 0)

Reusable harnesses and fixtures for the resource-lifecycle invariants later
implementation phases must hold (internal §17.2 "count effects, not only
visible outcomes"; §17.3 "required two-app and HMR fixtures"). These are
Phase 0 senior-owned spikes, not first-class `@nuxt/test-utils` features —
each subsection below explains the gap it had to fill and why.

## Running

```sh
pnpm vitest --project=nuxt test/proofs/harnesses          # two-app + browser-unmount/same-app/app-replacement
pnpm vitest --project=proofs-harnesses                    # hmr + ssr-request-cleanup + disposal-vs-init
```

Both projects are registered in `vitest.config.ts`:

- `nuxt` project's `include` was extended with `test/proofs/harnesses/**/*.nuxt.test.ts` (real `environment: 'nuxt'`, needed for `#app`'s `createNuxtApp`/`useState`/`useNuxtApp`).
- a new `proofs-harnesses` project (`environment: 'node'`, serial, 60s timeout) covers `test/proofs/harnesses/**/*.harness.test.ts` — the HMR harness boots a real headless browser + Vite dev server and the SSR/disposal fixtures need no Nuxt context at all.

## 1. Two-app harness — `two-app/`

**File:** `two-app/two-app-harness.ts` (+ `two-app/two-app.nuxt.test.ts`)

Creates TWO independent Nuxt-app-like runtimes in one process and proves
`useState`/`nuxtApp.provide` do not bleed between them.

**Why this needed its own spike:** `@nuxt/test-utils`'s `mountSuspended`
calls `cleanupAll()` on every call and shares one implicit `vueApp` across a
whole test file (see `@nuxt/test-utils/dist/runtime-utils/index.mjs`) — it
mounts one component against one Nuxt app at a time, not two concurrent
ones. This harness instead uses the low-level `#app` API (`createNuxtApp`)
directly: `bootAppInstance(id, factory)` mounts a real, separate `vueApp`
per call and runs `factory()` inside that app's own mounted component
`setup()`.

**Isolation mechanic** (verified empirically during this build — see the
long comment at the top of `two-app-harness.ts`): Nuxt's `useNuxtApp()`
resolves the "current" app two ways — first via Vue's component-injection
context (`getCurrentInstance()?.appContext.app.$nuxt`), which correctly
varies per mounted `vueApp`; and only as a fallback via a process-wide
`unctx` context keyed by the build's static `appId`, which does **not** vary
per `createNuxtApp({ id })` call. **Composables you want isolated must run
inside a mounted component's `setup()`** (i.e. inside the `factory` you pass
to `bootAppInstance`) — calling them via a bare `nuxtApp.runWithContext()`
from outside a component tree silently falls through to the shared global
context.

**Plugging in a later phase's per-app Convex context:** call
`useNuxtApp()`/`nuxtApp.provide('convex', client)` from inside `factory()`
— it has component injection context there. `bootAppInstance` returns the
live `nuxtApp` so a test can assert on `nuxtApp.$convex` after boot (see the
"nuxtApp.provide is isolated per app" test).

**What the test file proves (4 tests):**

1. `useState` markers are isolated per app (no cross-app bleed).
2. `nuxtApp.provide('convex', ...)` is isolated per app (models the future per-app Convex client).
3. `disposeAll()`/`dispose()` stops each app's effect scope (`nuxtApp._scope.active`) independently.
4. **Negative control:** a deliberately naive plugin using a bare module-scope variable (instead of per-app state) DOES bleed across two app instances booted in the same process — proving the harness is sensitive to the exact bug class internal §19.2 proof-gates ("module-global DevTools registries after per-app fixture passes").

**Serves later-phase invariants:** internal §19.2's proof gates for deleting
module-global registries/singletons (DevTools, connection-state store,
upload-queue sequence, logger caches) — plug the real plugin/composable
under test into `factory()` for app A and app B and assert isolation the
same way the negative-control test demonstrates the failure.

## 2. HMR harness — `hmr/`

**Files:** `hmr/hmr-harness.ts`, `hmr/fixture/*.js`, `hmr/hmr.harness.test.ts`

Boots a **real Vite dev server** (middleware mode) with a **real headless
browser** (Playwright) attached, so an on-disk file edit triggers a genuine
client-side Vite HMR update — not a simulation.

**Environment finding (re-confirmed during this build, matching
`proofs-harness.md`):** `nuxi dev` hangs on every HTTP request in this
sandbox (`curl` connects but times out with zero bytes; reproduced directly
via `npx nuxi dev`, independent of any Nuxt config). A **plain Vite dev
server** in middleware mode (no Nitro, no vite-node SSR bridge) does **not**
have this problem — verified end to end: a naive listener leaks 1→2 entries
across one real HMR cycle, a well-behaved one (`import.meta.hot.dispose`)
stays at 1. `nuxi dev`'s client bundle is itself plain Vite under the hood,
so this harness exercises the actual HMR engine Nuxt's dev server uses;
only Nitro's server-request layer (broken here) is bypassed. **Scope
caveat:** this proves Vite HMR mechanics faithfully but does not exercise
Nuxt/Nitro's dev-SSR request path — that is the separate, still-blocked
internal §16 SSR-detached-scope proof.

**API:**

```ts
const harness = await createHmrHarness()
const before = await harness.page.evaluate(() => window.__hmrRegistry.length)
await harness.editFile('naive-plugin.js', (c) => c + `\n// bump ${Date.now()}`)
await harness.waitForHmrCycle() // polls a real vite:afterUpdate signal, no fixed sleep
const after = await harness.page.evaluate(() => window.__hmrRegistry.length)
await harness.dispose()
```

`editFile` mutates a private `mkdtemp` copy of `hmr/fixture/` — the
tracked fixture files on disk are never modified by a test run.

**What the test file proves (2 tests):** counts `window.__hmrRegistry`
(a deliberately-registered listener array) before/after one real HMR cycle:
the naive plugin (`fixture/naive-plugin.js`, no dispose hook) leaks one more
listener per cycle; the well-behaved plugin (`fixture/good-plugin.js`, uses
`import.meta.hot.dispose`) stays constant. A second test runs two
consecutive cycles to prove no cross-cycle interference.

**Serves later-phase invariants:** any plugin/composable that must prove it
does not leak a registered listener/subscription/interval across an HMR
reload (internal §17.3's HMR fixture requirement; feeds the same class of
proof gates as the two-app harness's negative control, but for the
same-app/same-process HMR-reload case rather than the two-concurrent-apps
case).

## 3. Lifecycle fixtures — `lifecycle/`

**File:** `lifecycle/resource-counter.ts` — shared `createResourceCounter()`
helper used by every fixture below. Tracks `created`/`disposed`/`live()`
counts (internal §17.2: count effects, not only the final visible value).
Mock counters, no live Convex client — used wherever a real client isn't
essential, per the assignment.

- **`browser-unmount.nuxt.test.ts`** — mounts a component that opens a
  subscription (`MockConvexClient.onUpdate`, the same double the
  `test/nuxt` composable suites already use) in `onMounted` and releases it
  in `onUnmounted`; counts `activeListenerCount()` before/after `unmount()`,
  including across three independent mount/unmount cycles.
- **`same-app-reevaluation.nuxt.test.ts`** — reruns a plugin's
  registration logic against the **same still-live** app instance multiple
  times (the shape an HMR pass takes when it re-invokes a plugin without
  disposing the app) and asserts the live count stays constant for an
  idempotent (dispose-before-recreate) plugin, plus a negative control
  showing a naive always-create plugin grows every pass.
- **`app-replacement.nuxt.test.ts`** — contrasts with the above: disposes
  the OLD app (via `two-app/two-app-harness`'s `bootAppInstance`) and only
  then creates a genuinely NEW one, asserting live count returns to zero
  after every explicit disposal across three replacement generations.
- **`ssr-request-cleanup.harness.test.ts`** — internal §16's required proof
  ("one request-completion path that runs for successful and failed
  renders"): a single `try/finally`-shaped function disposes its
  request-scoped resource on both the success and the throw path, plus an
  interleaved-outcomes test proving neither path ever accumulates a live
  resource. **Scope note in the file:** this proves the generic mechanic
  the proof gate requires; it does not itself authorize adding a detached
  SSR scope to production code (internal §16's default remains "allocate
  none").
- **`disposal-vs-initialization.harness.test.ts`** — proves an _ordering_
  invariant (vNext.md §5.4: rebind to the fresh primary client "before
  publishing B"), not just a final-count invariant: a correct A→B
  replacement disposes A strictly before creating B; a negative control
  shows a misordered replacement (B created while A is still live) has an
  _identical final live count_ but a provably different operation order —
  demonstrating why count-only assertions are insufficient and an
  order-of-operations assertion is required for this class of invariant.

**Serves later-phase invariants:** internal §17.3's fixture list verbatim
("browser unmount, same-app reevaluation, app replacement, SSR request
cleanup, disposal-versus-initialization"); the ordering fixture specifically
backs the vNext.md §5.4 primary-client-replacement rebinding contract.
