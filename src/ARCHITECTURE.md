# Better Convex Nuxt — Internal Architecture

Status: living document, extended per phase. This skeleton is seeded in Phase 1
(W1) and grows as later phases land their owners. Public contracts live in
`vNext.md`; internal invariants and maintenance rules live in
`wenext_internal.md`. This file is the in-tree map of who owns what, the
dependency direction, and the durable decisions (ADRs) future maintainers must
not silently reverse.

> Sections marked _(Phase N)_ are intentionally stubs until that phase's owner
> fills them. Do not delete a stub; extend it.

---

## 1. Ownership table (internal §3.1)

Every important concept has exactly one owner. No implementation may add a second
registry, inferred reconstruction path, or cache for a row without a
senior-approved amendment.

| Concept                                                      | Sole owner after vNext                             | Phase |
| ------------------------------------------------------------ | -------------------------------------------------- | ----- |
| Effective build configuration                                | Pure module build-plan resolver (`src/module.ts`)  | 1     |
| Normalized public runtime configuration                      | Per-Nuxt-app runtime context / `useConvexConfig()` | 1     |
| Server secrets and server-only limits                        | Nitro private runtime config                       | 4     |
| Auth identity, auth epoch, identity generation, public error | Per-app auth context (behind `AuthIdentityPort`)   | 1→3   |
| Auth operation progress count                                | Per-app pending-operation tracker                  | 3     |
| Primary client for the current identity generation           | Per-app runtime client owner                       | 1→3   |
| Query wire dedup and per-transport local cache               | Current `ConvexClient` instance                    | 1     |
| SSR payload reuse                                            | Nuxt payload and async-data key                    | 1     |
| Mounted query result and transform                           | Individual composable instance                     | 1     |
| Explicit Vue state sharing                                   | One `defineSharedConvexQuery` definition per app   | 1     |
| Pagination page and cursor generation                        | One pagination controller per composable instance  | 1     |
| Connection-state snapshot                                    | Per-app runtime client owner                       | 1→3   |
| Server credential snapshot                                   | One `ServerConvexCaller` instance                  | 4     |
| Cross-request auth-token cache                               | Server cookie-resolution cache owner               | 4     |
| Generic call-error representation                            | Framework-free `/errors` entry                     | 2     |
| Product authorization interpretation                         | Consumer application                               | —     |
| Logger instance and sanitization policy                      | Per-app runtime context                            | 1→3   |
| DevTools state                                               | One bounded per-app `DevtoolsSink`                 | 3     |
| App-lifetime resource cleanup                                | Per-app runtime disposer                           | 3     |
| Component query-listener cleanup                             | Owning Vue effect scope                            | 1     |
| SSR detached-resource cleanup                                | Request-scoped disposer (only if unavoidable)      | 4     |

## 2. Dependency direction (internal §3.2)

- Nuxt owns app instances, SSR payloads, plugin order, runtime config, teardown.
- Convex owns query transport, wire dedup, local query caching, function refs,
  and official HTTP execution.
- Better Auth owns session operations and plugin client methods.
- Better Convex Nuxt owns deterministic coordination between those systems.
- Applications own authorization policy, redirects from business errors, roles,
  permissions, and product workflows.

Framework-free entries (`better-convex-nuxt/errors`, `.../auth-client`) import no
Nuxt, Vue, `#imports`, browser globals, or server globals _(Phase 2/3)_.

## 3. Per-app runtime lifecycle _(Phase 3)_

One private runtime context per Nuxt application owns config, auth context,
client owner, logger, DevTools, and the disposer. Browser teardown is registered
through `nuxtApp.vueApp.onUnmount`; `dispose()` is idempotent. Phase 1 wires the
core client plugin, the auth-enabled-only client/server plugins, and app-unmount
closure of the primary client; the full runtime context and client owner land in
Phase 3.

## 4. Auth identity and operation separation (vNext §5.3, internal §6)

- `status` (`ConvexAuthStatus`) describes current usable identity; `isPending`
  describes auth work in flight. They are independent. Derivation precedence:
  `disabled → loading → authenticated → error → anonymous`
  (`src/runtime/utils/auth-status.ts`).
- Identity partitioning uses the single stable key extractor
  `getConvexIdentityKey` (`src/runtime/utils/identity-key.ts`):
  `'anonymous' | user:${betterAuthUserId}`. Never a JWT or token hash.
- Two monotonic counters, published solely by the `AuthIdentityPort` adapter
  (`src/runtime/auth/identity-port.ts`): `authEpoch` invalidates stale
  auth-operation work (bumped by same-user rotation too); `identityGeneration`
  changes only when the stable identity key changes.
- Phase 1 freezes `AuthIdentityPort` and adapts the existing engine to it. Query
  gating and the client owner read auth state ONLY through this port. Phase 3
  replaces the provider, not the port.

## 5. Query identity-isolation rules _(Phase 1: W2/W3)_

`required`/`optional` holders key on `{ identityKey, identityGeneration }`; `none`
uses a separate stable anonymous-transport dimension and never changes on auth
identity changes. On identity-key change, identity-owned state is cleared
synchronously and the primary client is retired/replaced; `none`'s dedicated
never-authenticated client is untouched. See ADR-001.

## 6. Server / client / framework-free entry boundaries

- Root (`.`): the Nuxt module default export plus stable public types. Does not
  export the raw `ConvexPublicRuntimeConfig`.
- `better-convex-nuxt/errors`: sole runtime home of the error contract _(Phase 2)_.
- `better-convex-nuxt/auth-client`: definition helper only _(Phase 3)_.
- `better-convex-nuxt/server`, `.../server/createUserSyncTriggers` _(Phase 4)_.

## 7. Comment and ADR policy (internal §14)

Public JSDoc describes the final contract; internal comments state invariants and
the "why", not narration. Durable, non-obvious decisions become ADRs below. Each
ADR records status, context, decision, consequences, and the guarding test.

---

## ADR-001 — Stable identity partitioning and identity-scoped client replacement

- **Status:** Accepted (vNext §5.4, §5.8 proof 4; internal §7.4).
- **Context:** Convex query tokens are identity-blind and Convex 1.38 privately
  retains/reapplies pending optimistic updates. Clearing only Nuxt payloads and
  query state leaks one user's data to the next on a reused client.
- **Decision:** Partition every identity-varying holder by the single stable key
  extractor plus `identityGeneration`. Retire and close the primary
  `ConvexClient` on every stable identity-key change (anonymous↔user, user↔user);
  retain it for same-user token rotation. Route live `none` queries through a
  dedicated per-app never-authenticated anonymous client. Never import private
  Convex modules to purge state.
- **Consequences:** A per-app client owner and lazy anonymous client; every
  library client constructed with `unsavedChangesWarning: false`.
- **Guarding test:** §5.8 proof 4 and the §17 isolation fixtures; the Phase 1
  A→B isolation Nuxt tests.

## ADR-002 — Convex-owned subscription dedup; delete parallel subscription machinery

- **Status:** Proposed, gated on the wire proof fixture (internal §7.1).
- **Context:** `BaseConvexClient` deduplicates identical query subscriptions.
  Better Convex Nuxt historically maintained a parallel subscription registry,
  reference counts, and query bridges.
- **Decision:** After the permanent wire fixture proves Convex ownership, delete
  the parallel machinery and rely on Convex dedup plus a library-owned
  payload-key grammar for sign-out/identity purge.
- **Consequences:** Sign-out purge is a namespace scan over the payload-key
  grammar, not a registry consult.
- **Guarding test:** the permanent Convex wire fixture (internal §7.1) _(Phase 1:
  W2/W3 finalize deletion)_.

## ADR-003 — Epoch-scoped refresh deduplication

- **Status:** Accepted (vNext §5.3, §5.8 proof 8; internal §6.5).
- **Context:** Background token refresh and integrated sign-in/sign-up/sign-out
  share one identity timeline. A slow in-flight refresh must never win a race
  against a later, faster identity operation and must never silently apply a
  stale result after a newer identity has already committed.
- **Decision:** `authEpoch` is a monotonic counter bumped by every identity
  operation (including same-user token rotation) at dequeue time, before it
  awaits Better Auth or performs its effect — never at invocation time.
  `refresh()` (`src/runtime/auth/client-engine.ts`) captures the current
  `authEpoch` and deduplicates concurrent callers only while that epoch is
  still current (`refreshEpoch === authEpoch`); a caller observing a newer
  epoch starts a fresh refresh instead of awaiting a stale one. A refresh's
  result may only commit (`installSetAuth`/`commitTransition`) when its
  captured epoch still equals the live `authEpoch`; otherwise it is discarded.
  The serial identity-operation queue (`src/runtime/auth/serial-queue.ts`)
  keeps sign-in/sign-up/sign-out in one FIFO chain that survives individual
  rejections, so refresh dedup only has to arbitrate against the queue's
  current epoch, not against reordering within the queue itself.
- **Consequences:** A background refresh can never overwrite a completing
  sign-in/sign-out with stale data, and same-user rotation never triggers a
  redundant refresh storm. The cost is that every commit site must re-check
  its captured epoch before writing shared state — there is no single choke
  point that makes this automatic.
- **Guarding test:** `test/unit/auth-generation-races.test.ts` (`same-user token
rotation bumps authEpoch but not identityGeneration`, `deferred refresh
cannot commit across a completing sign-out`, `does not independently wait for
a concurrent sign-in unless its refresh was captured`); historically proved
  live against a real `ConvexClient` by the deleted Phase 0 prototype
  `test/proofs/auth-races/proof8-epoch-refresh-dedup.mjs`.

## ADR-004 — Server-boundary sanitization of the credential exchange

- **Status:** Accepted (vNext §5.8 proofs 5 and 7; internal §10).
- **Context:** `serverConvex`'s cookie/bearer-to-Convex-token exchange
  (`src/runtime/server/utils/token-exchange.ts`) talks to an upstream HTTP
  endpoint that is not fully trusted: it can return an oversized, malformed, or
  non-OK body, and — if naively followed — a redirect could carry the
  credential to a different origin. Any of these must never leak a raw
  credential or unstructured upstream response body into a public error, log
  line, or payload.
- **Decision:** `exchangeConvexToken` validates the credential shape
  synchronously before any network access; issues the fetch with
  `redirect: 'error'` so a redirect can never be followed with the credential
  attached; bounds and drains oversized/malformed/missing-token/timeout
  responses into one classified `transport` failure instead of surfacing the
  raw body; and never interpolates the credential or raw response text into a
  thrown error, a log call, or `ConvexCallError.data`.
- **Consequences:** Every upstream failure mode collapses to the same public,
  secret-free `ConvexCallError` shape; adding a new upstream failure mode must
  route through the same classification rather than adding an ad hoc
  passthrough.
- **Guarding test:** `test/unit/token-exchange.test.ts` (HTTP failure
  classification, redirect-safety, and "secrets never appear in logs" describe
  blocks) — the permanent successor explicitly modeled on the retained Phase 0
  fixture `test/proofs/server-security/` (proofs 5 and 7), which stays in the
  tree as the release-gate reference for this contract.

## ADR-005 — The four-method replacement-safe `useConvex()` handle

- **Status:** Accepted (vNext §5.4, §5.8 proof 11; internal §4.4; stop
  condition 11).
- **Context:** The primary `ConvexClient` is retired and replaced on every
  identity-key change (ADR-001). A consumer that held a raw client reference
  across that swap would either keep talking to a closed client or need to
  re-subscribe manually. Ginko's standalone Studio bridge also subscribes
  through `bridge.convexClient.onUpdate` with no composable alternative
  (vNext §10.6), so the handle cannot shed `onUpdate` without breaking that
  consumer.
- **Decision:** `useConvex()` returns one stable object exposing exactly
  `query | mutation | action | onUpdate`, never the raw `ConvexClient`. Calls
  dispatch to whichever client is current at call time (`src/runtime/auth/
client-owner.ts`); `onUpdate` rebinds an active listener from the outgoing
  client to the incoming one across a primary replacement with a stable
  unsubscribe identity and never more than one live subscription for that
  listener, and in-flight consumer-held calls on a retired client reject with
  `ConvexCallError({ kind: 'authentication', code: 'IDENTITY_CHANGED' })`
  rather than hanging.
- **Consequences:** The handle's surface is intentionally frozen at these four
  methods; reducing it requires the funded Studio-migration decision in
  §5.8 proof 11, not a silent surface reduction (vNext §14 stop condition 11).
  No caller may import Convex private modules to work around the handle.
- **Guarding test:** `test/unit/client-owner.test.ts` ("onUpdate rebinding
  (proof 11 mechanics)" and "rejects an in-flight consumer-held mutation with
  IDENTITY_CHANGED on retirement" describe blocks); historically proved live
  against a real `ConvexClient` by the deleted Phase 0 prototype
  `test/proofs/onupdate-rebinding/onupdate-rebinding.proof.mjs`.
