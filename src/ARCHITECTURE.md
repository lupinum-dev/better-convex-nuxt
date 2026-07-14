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

| Concept                                            | Sole owner after vNext                             | Phase |
| -------------------------------------------------- | -------------------------------------------------- | ----- |
| Effective build configuration                      | Pure module build-plan resolver (`src/module.ts`)  | 1     |
| Normalized public runtime configuration            | Per-Nuxt-app runtime context / `useConvexConfig()` | 1     |
| Server secrets and server-only limits              | Nitro private runtime config                       | 4     |
| Better Auth session truth                          | Better Auth public `useSession()` result           | 3     |
| Canonical Convex identity (`convex:identity`)      | Per-app auth context (behind `AuthIdentityPort`)   | 1→3   |
| Auth epoch, identity generation, public auth error | Per-app auth context (behind `AuthIdentityPort`)   | 1→3   |
| Auth operation progress count                      | Per-app pending-operation tracker                  | 3     |
| Primary client for the current identity generation | Per-app runtime client owner                       | 1→3   |
| Query wire dedup and per-transport local cache     | Current `ConvexClient` instance                    | 1     |
| SSR payload reuse                                  | Nuxt payload and async-data key                    | 1     |
| Mounted query result and transform                 | Individual composable instance                     | 1     |
| Explicit Vue state sharing                         | One `defineSharedConvexQuery` definition per app   | 1     |
| Pagination page and cursor generation              | One pagination controller per composable instance  | 1     |
| Connection-state snapshot                          | Per-app runtime client owner                       | 1→3   |
| Server credential snapshot                         | One `ServerConvexCaller` instance                  | 4     |
| Generic call-error representation                  | Framework-free `/errors` entry                     | 2     |
| Product authorization interpretation               | Consumer application                               | —     |
| Logger instance and sanitization policy            | Per-app runtime context                            | 1→3   |
| DevTools state                                     | One bounded per-app `DevtoolsSink`                 | 3     |
| App-lifetime resource cleanup                      | Per-app runtime disposer                           | 3     |
| Component query-listener cleanup                   | Owning Vue effect scope                            | 1     |
| SSR detached-resource cleanup                      | Request-scoped disposer (only if unavoidable)      | 4     |

## 2. Dependency direction (internal §3.2)

- Nuxt owns app instances, SSR payloads, plugin order, runtime config, teardown.
- Convex owns query transport, wire dedup, local query caching, function refs,
  and official HTTP execution.
- Better Auth owns session truth, cookies, session operations, and plugin client methods.
- Better Convex Nuxt observes Better Auth's public session state and owns deterministic Convex coordination.
- The consuming app owns the one exact Better Auth, Convex Better Auth, and
  Convex peer tuple; the module must not install parallel physical instances of
  these stateful plugin/type runtimes.
- Applications own authorization policy, redirects from business errors, roles,
  permissions, and product workflows.

Framework-free entries (`better-convex-nuxt/errors`, `.../auth-client`) import no
Nuxt, Vue, `#imports`, browser globals, or server globals _(Phase 2/3)_.

## 3. Per-app runtime lifecycle _(Phase 3)_

One private runtime context per Nuxt application owns config, auth context,
client owner, logger, DevTools, and the disposer. Browser teardown is registered
through `nuxtApp.vueApp.onUnmount`; `dispose()` is idempotent. Disposal stops the
Better Auth observer, cancels confirmation and session-correlation waiters,
rejects active or queued integrated auth operations, detaches live listeners,
rejects consumer calls, and closes primary, replacement, and anonymous clients.
Late Better Auth, token, or confirmation results cannot publish after disposal.

## 4. Auth identity and operation separation (vNext §5.3, internal §6)

- `useState<AuthIdentity>('convex:identity')` is the only published Convex
  identity value. Its variants are `disabled`, `loading`, `anonymous`, and
  `authenticated`; the authenticated variant contains token, user, and stable
  key. Public token, user, and authenticated flags are derived from that one
  assignment. They are never independently writable state.
- `status` (`ConvexAuthStatus`) describes the display identity; `isPending`
  describes auth work in flight. They are independent. Derivation precedence is
  `disabled → loading → authenticated → error → anonymous`
  (`src/runtime/utils/auth-status.ts`). An SSR-hydrated authenticated identity
  remains display-stable during browser startup, while the coordinator's private
  `settled` flag stays false until the primary `ConvexClient` confirms its
  `setAuth` transition.
- Identity partitioning uses the single stable key extractor
  `getConvexIdentityKey` (`src/runtime/utils/identity-key.ts`):
  `'anonymous' | user:${betterAuthUserId}`. Never a JWT or token hash.
- Two monotonic counters, published solely by the `AuthIdentityPort` adapter
  (`src/runtime/auth/identity-port.ts`): `authEpoch` invalidates stale
  auth-operation work (bumped by same-user rotation too); `identityGeneration`
  changes only when the stable identity key changes.
- Better Auth's public `useSession()` result is the sole browser input for
  session-changing auth ceremonies. The observer watches pending, error, and the
  `data` reference, then reads `data.session.token`. Watching `data` rather than
  the outer store value catches real same-session user/session changes without
  reconciling refetch bookkeeping whose session data is unchanged.
- Integrated sign-in/sign-up correlate the exact non-empty `data.token` returned
  by Better Auth with the exact public `data.session.token` observation. A
  different session token cannot release the action. Integrated sign-out waits
  for the public no-session observation. All three retain their FIFO and pending
  semantics and wait for observer-owned Convex reconciliation; they never
  perform a parallel token exchange. Explicit `refresh()` remains the distinct
  same-session token/claim refresh operation.
- Query gating and the client owner read epochs, generations, errors, and
  dispatch readiness only through the frozen `AuthIdentityPort`. The owner does
  not dispatch `query`, `mutation`, `action`, or bind `onUpdate` while initial
  browser confirmation is unsettled. Failed initial authenticated confirmation
  and failed authenticated replacement both keep the prior principal retired
  and recover through one fresh anonymous generation; if that recovery also
  fails, the terminal published state remains anonymous with an auth error.

### 4.1 Server cookie, JWT, and hydration boundary

- The supported browser cookie contract is Better Auth's default
  `better-auth.*` / `__Secure-better-auth.*` namespace, default session name,
  host-only scope, root path, and `/api/auth` base path. Request parsing matches
  the pinned Better Auth parser: the last duplicate name wins and an existing
  secure session cookie is authoritative even when empty. The proxy preserves
  every supported namespace cookie because OAuth, verifier, nonce, MFA,
  trusted-device, cache, and plugin ceremonies are Better Auth-owned. An
  upstream `Set-Cookie` outside that namespace or with a `Domain` attribute is
  a visible 502 configuration failure. There is no custom-name, prefix,
  cross-subdomain, or custom-base-path compatibility branch.
- SSR has one identity path: exchange the filtered Better Auth cookies at the
  fixed, redirect-free `/api/auth/convex/token` endpoint, then derive a
  provisional display user from that token. There is no `/get-session`
  fallback and no second user source. Local JWT parsing never verifies or
  authorizes: it accepts only a bounded, canonical payload with an exact
  non-empty string `sub` and usable `exp`; Convex alone verifies signature,
  algorithm, key, issuer, audience, subject, and time before backend work.
- Custom JWT claims remain a display feature, but local publication is bounded
  and property-safe: the entire token is at most 64 KiB; display strings and
  `sub` are at most 4096 characters; property names are at most 256 characters;
  objects and arrays are limited to 64 entries and four container levels; and
  `__proto__`, `constructor`, `prototype`, reserved identity, and internal
  claims are omitted. Unsupported custom values are omitted, never coerced.
- Every auth-enabled SSR response varies on `Cookie`. A recognized Better Auth
  cookie or serialized token forces `Cache-Control: private, no-store` and
  removes application-visible surrogate/CDN cache controls. Later route rules,
  deployed CDN policy, and caches that ignore these headers remain
  operator-owned and must never store authenticated HTML.
- Session deletion prevents a fresh token exchange once Better Auth observes
  it, but cannot revoke an already-issued stateless Convex JWT. The pinned
  adapter defaults to a 15-minute JWT; Better Auth cookie caching can add its
  own configured lifetime before deletion is observed. Applications needing a
  shorter high-risk exposure window must shorten both lifetimes or revalidate
  canonical server state inside the protected Convex operation.

### 4.2 Better Auth plugin support boundary

- `convex()` owns the one supported JWT integration and already embeds the
  Better Auth JWT and bearer plugins. A separate generic `jwt()` plugin would
  create a second JWT/JWKS path and is forbidden.
- Two-factor authentication is unsupported on the pinned Better Auth `1.6.23`
  and Convex Better Auth `0.12.5` tuple. The packaged component schema lacks
  `failedVerificationCount` and `lockedUntil`, while the adapter advertises no
  transactions and does not implement a native atomic `incrementOne`; Better
  Auth's read-then-update fallback can lose concurrent lockout increments.
  Regenerating a local schema fixes only the field mismatch, not the atomicity
  requirement. When a future tuple satisfies both contracts, `twoFactor()` must
  precede `convex()` so the two-factor after-hook can delete the pre-challenge
  session before the Convex after-hook considers JWT minting.
- The fixed proxy accepts only Better Auth's prefixed cookie namespace. The
  standalone Better Auth OIDC Provider and MCP plugins use the unprefixed
  `oidc_login_prompt` and `oidc_consent_prompt` cookies and are therefore
  unsupported through this boundary. The limited OIDC discovery/JWKS endpoints
  embedded inside `convex()` do not opt the application into those provider
  ceremonies.
- OAuth account linking is explicit and conservative: implicit same-email
  linking is disabled, different-email linking is disabled, the last account
  cannot be unlinked, and provider profile data does not overwrite the local
  user on link. Provider trust is opt-in and deployment-specific. Access and
  refresh tokens must use Better Auth's at-rest encryption on ordinary OAuth
  paths, but the pinned implementation still leaves provider ID tokens
  unencrypted and its direct ID-token linking path bypasses the encryption
  helper for all supplied tokens; component data, backups, and logs remain
  credential-bearing and direct ID-token linking is outside the supported
  policy without a separate review.
- `createClient(..., { verbose: true })` prints auth request and response
  headers. It is forbidden in production because those headers can contain
  cookies, bearer credentials, and `Set-Cookie` values.
- OAuth callbacks and account-recovery ceremonies remain operator-owned. Unit
  or mocked callback evidence cannot establish support for a provider,
  delivery channel, password reset, OTP, or recovery-code path; each deployed
  ceremony requires real-provider success, denial, expiry, single-use,
  revocation, and rollback evidence.
- Password examples set `autoSignIn: false` to avoid Better Auth 1.6.23's
  immediate duplicate-signup status/token/session disclosure. This remains a
  partial mitigation, not an enumeration boundary: the synthetic duplicate
  response shape differs and a follow-up sign-in distinguishes a pre-existing
  account from the newly created account. Public signup support is conditional
  on an accepted policy or an upstream/provider ceremony that closes both.

### 4.3 Browser rendering, bearer, and navigation boundary

- The browser's Convex JWT is an active bearer credential used by Convex HTTP
  and WebSocket transports. It is intentionally available to application
  JavaScript and may be serialized in authenticated SSR hydration state; it is
  never persisted separately or copied into URLs, logs, analytics, errors, or
  rendered markup. `HttpOnly` on the Better Auth cookie does not protect this
  credential from same-origin script execution. An XSS flaw can act as the
  current user and can steal the JWT for use until expiry.
- Maintained components render backend, identity, error, and diagnostic values
  through Vue text interpolation. Attacker-controlled values never enter
  `v-html`, dynamic templates, executable attributes, or script construction.
  Rich HTML is a consumer-owned feature and must follow
  [Vue's security guidance](https://vuejs.org/guide/best-practices/security)
  with context-appropriate sanitization. Escaping is not authorization;
  protected operations authorize against canonical backend state.
- Shipped runtime and documentation surfaces load no mutable third-party
  runtime script. Applications that add scripts own their code and supply-chain
  risk: audit and pin or self-host them, scope them to required pages, and never
  expose auth URLs, bearer credentials, or sensitive fields to analytics.
- An enforced [CSP](https://www.w3.org/TR/CSP3/) is deployment-owned because
  exact application, Convex HTTPS/WebSocket, asset, and provider origins vary.
  Start from `default-src 'self'`, `base-uri 'none'`, and `object-src 'none'`;
  use nonces or hashes for required scripts; enumerate the minimum exact
  `connect-src` and asset origins; avoid wildcards, `unsafe-eval`, and
  unrestricted `unsafe-inline`; and deny framing when embedding is not a
  product requirement. Report-only rollout may tune the policy, but release
  evidence requires enforcement plus deployed auth, SSR, and reconnect checks.
  CSP is defense in depth and cannot make a stolen bearer token revocable.
- Route protection may generate a local return target, but a direct sign-in
  query is still attacker-controlled input. A consumer either ignores it or
  normalizes it against a fixed application origin to one exact local path,
  rejecting absolute and scheme-relative URLs, backslashes, control characters,
  malformed encoding, and non-path values before using it as Better Auth's
  `callbackURL`.

## 5. Query identity-isolation rules _(Phase 1: W2/W3)_

`required`/`optional` holders key on `{ identityKey, identityGeneration }` and
route live queries through the client owner's stable handle. During a primary
replacement their listener remains registered but unbound, then acquires the
confirmed replacement without a composable-owned raw-client retry path. `none`
uses a separate stable anonymous-transport dimension and a dedicated raw client
that never receives `setAuth`; it is untouched by identity changes. On an
identity-key change, identity-owned state is cleared synchronously and the
primary client is retired before its replacement is constructed. See ADR-001.

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
- **Context:** Convex query tokens are identity-blind and the pinned Convex client
  privately retains/reapplies pending optimistic updates. Clearing only Nuxt payloads and
  query state leaks one user's data to the next on a reused client.
- **Decision:** Partition every identity-varying holder by the single stable key
  extractor plus `identityGeneration`. Retire and close the primary
  `ConvexClient` on every stable identity-key change (anonymous↔user, user↔user);
  retain it for same-user token rotation. Route `required`/`optional` live
  queries through the owner's replacement-safe handle so a listener can remain
  dormant while no primary exists and bind once the confirmed replacement is
  published. Route live `none` queries directly through a dedicated per-app
  never-authenticated anonymous client. Never import private Convex modules to
  purge state.
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
- **Decision:** `authEpoch` is a monotonic counter bumped by every canonical
  session revision and before each refresh commit (including same-user token
  rotation). Sign-out additionally advances it at dequeue, before awaiting
  Better Auth, so an older refresh cannot commit after session revocation.
  `refresh()` (`src/runtime/auth/client-engine.ts`) captures the current
  `authEpoch` and deduplicates concurrent callers only while that epoch is
  still current (`refreshEpoch === authEpoch`); a caller observing a newer
  epoch starts a fresh refresh instead of awaiting a stale one. A refresh's
  result may only commit (`installSetAuth`/`commitTransition`) when its
  captured epoch still equals the live `authEpoch`; otherwise it is discarded.
  The serial identity-operation queue (`src/runtime/auth/serial-queue.ts`)
  keeps sign-in/sign-up/sign-out in one FIFO chain that survives individual
  rejections. Successful operations await the exact public-session observation
  described by ADR-006, so refresh dedup arbitrates against that canonical
  reconciliation rather than a wrapper-owned exchange.
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
- **Decision:** `exchangeConvexToken` validates the credential shape and, for
  cookie credentials, filters to a non-empty supported Better Auth session
  namespace synchronously before any network access; issues the fetch with
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
  `query | mutation | action | onUpdate`, never the raw `ConvexClient`. Before
  the first browser primary confirms, calls await `AuthIdentityPort` settlement
  and listeners remain registered but unbound. After settlement, calls dispatch
  to whichever client is current at call time
  (`src/runtime/client/client-owner.ts`); `onUpdate` binds or rebinds an active
  listener to the current confirmed client with a stable unsubscribe identity
  and never more than one live subscription for that listener. In-flight calls
  on a retired client reject with authentication code `IDENTITY_CHANGED` rather
  than hanging.
- **Consequences:** The handle's surface is intentionally frozen at these four
  methods; reducing it requires the funded Studio-migration decision in
  §5.8 proof 11, not a silent surface reduction (vNext §14 stop condition 11).
  No caller may import Convex private modules to work around the handle. Owner
  disposal rejects waiting and in-flight calls and detaches all listeners;
  primary factory or initialization failure cannot make the retired principal
  dispatchable again.
- **Guarding test:** `test/unit/client-owner.test.ts` ("onUpdate rebinding
  (proof 11 mechanics)" and "rejects an in-flight consumer-held mutation with
  IDENTITY_CHANGED on retirement" describe blocks); historically proved live
  against a real `ConvexClient` by the deleted Phase 0 prototype
  `test/proofs/onupdate-rebinding/onupdate-rebinding.proof.mjs`.

## ADR-006 — One browser session-reconciliation source

- **Status:** Accepted (security hardening SH-002).
- **Context:** Integrated sign-in/sign-up wrappers previously exchanged a Convex
  token directly after Better Auth returned while the public Better Auth session
  observer independently exchanged again for the same ceremony. Sign-out also
  committed anonymous directly before the observer repeated the transition.
  Those competing paths assigned separate epochs and made outcome ordering
  depend on which exchange finished first.
- **Decision:** `reconcileSession()` is the only path that translates a Better
  Auth session observation into a Convex identity transition. The observer
  watches the public `useSession()` pending flag, `data` reference, and error;
  once not pending it extracts the stable `data.session.token`, or `null` when
  absent. The `data` reference changes for real same-session user/session data
  changes while JSON-equal refetches retain it, so claim changes reconcile
  without treating refetch bookkeeping as a new identity input. Integrated
  sign-in/sign-up wait for reconciliation of the exact `data.token` returned by
  their Better Auth result; integrated sign-out waits for `null`. Raw Better
  Auth operations converge through the same observer. The explicit `refresh()`
  API remains separate because it refreshes token claims for the current
  session; wrappers never call it.
- **Consequences:** One public session-data change produces one reconciliation
  exchange and one ordered commit. A successful integrated operation resolves
  only after observer-owned work for its exact session token completes; an
  unrelated token observation cannot release it. Barriers are captured before
  invoking Better Auth so an early matching observation is not lost, cancelled
  for errors and non-session results, bounded, and cancelled on disposal. A
  token-bearing result with no matching observation retires any prior identity
  and rejects with `SESSION_RECONCILIATION_TIMEOUT`. Better Auth session
  signaling is therefore a required integration contract; callers must not
  suppress it on session-changing operations.
- **Guarding test:** `test/security/client-auth-regressions.test.ts` ("uses one
  observer-owned token exchange for an integrated sign-in", exact-token
  correlation, and sign-out reconciliation),
  `test/security/session-observer-regressions.test.ts` (same-session data
  changes), and `test/unit/integrated-auth-namespace.test.ts` (barrier and
  result-token fixtures).
