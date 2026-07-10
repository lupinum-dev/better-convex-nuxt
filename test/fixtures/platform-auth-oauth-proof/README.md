# platform-auth OAuth proof fixture

## Provenance

`starters/platform-auth` was an experimental public-OAuth platform starter
(Better Auth OAuth Provider — DCR, PKCE, resource-bound JWTs, introspection,
revocation, `/mcp` product writes). It shipped no deterministic test suite,
only a live-deployment shell script
(`scripts/verify-oauth-provider-runtime.sh`). Per the ratified Phase 0 starter
classification (`wenext_internal.md` §15.4, §20 "repository install-root and
starter classification, including the binding keep/delete decision for each
starter"), a starter with no CI-gated proof is not a maintained starter and is
deleted rather than kept half-finished.

This fixture is the deterministic named proof fixture called for by that
ruling ("Convert `platform-auth` into a deterministic named proof fixture if
its code remains needed"): the starter's load-bearing OAuth-client/token
proof code moved here, the live verification script was deleted, and the rest
of `starters/platform-auth/` (app scaffolding, `AGENTS.md`, its own
lockfile/package.json, the auth/http/config wiring that only existed to host
these two files in a runnable starter) was deleted with it.

## What this proves

`convex/oauthProof.ts` and `convex/oauthMcpProof.ts` are the two proof modules
that inspect and mutate Better Auth OAuth Provider component state directly
through `components.betterAuth.adapter` (`findMany`/`updateMany` against the
`oauthClient`, `oauthRefreshToken`, `oauthAccessToken`, and `oauthConsent`
models) and gate an app-owned mutation
(`createProjectFromVerifiedOAuthClient`) behind OAuth client
audience/scope/grant-type/scope checks.

This fixture proves, **offline and deterministically**, that those two
modules still type-check against the Better Auth component's generated
adapter contract — i.e. that the shape of `adapter.findMany`/`adapter.updateMany`
and the `oauthClient`/`oauthRefreshToken`/`oauthAccessToken`/`oauthConsent`
models the proof code depends on has not silently drifted. It is a
**typecheck-level** proof, not a live-service test: there is no Convex
deployment, no credentials, and no network I/O involved. It intentionally does
not prove runtime OAuth behavior (DCR, PKCE, token issuance/rotation,
introspection, revocation) — that required the deleted live verification
script and a real deployment, which is exactly what made the original starter
unmaintainable as CI-gated.

## Check command

```sh
npm run check:platform-auth-oauth-proof
# equivalent to:
tsc --noEmit -p test/fixtures/platform-auth-oauth-proof/tsconfig.json
```

Wired into `npm run typecheck:fixtures` / `npm run typecheck` / `npm run check`.

## Retained generated files (exact allowlist)

Only the generated files this fixture's typecheck strictly needs were kept;
everything else under the original starter's `convex/_generated` and
`convex/betterAuth/_generated` trees was deleted as unused by this proof.

```
convex/schema.ts                                  (source: defines `oauthProjects`, the
                                                    one app-owned table the proof mutates)
convex/oauthProof.ts                               (proof module 1, unmodified)
convex/oauthMcpProof.ts                            (proof module 2, unmodified)
convex/_generated/api.d.ts                         (declares `components.betterAuth`,
                                                    which both proof modules import)
convex/_generated/api.js                           (runtime counterpart of api.d.ts)
convex/_generated/dataModel.d.ts                   (DataModel used by _generated/server.d.ts)
convex/_generated/server.d.ts                      (declares `query`/`mutation`/`internalMutation`
                                                    used by both proof modules)
convex/_generated/server.js                        (runtime counterpart of server.d.ts)
convex/betterAuth/_generated/component.ts          (the `ComponentApi` type that api.d.ts
                                                    references for `components.betterAuth`;
                                                    this is the file that actually types
                                                    `adapter.findMany`/`adapter.updateMany`)
```

Deliberately **not** retained (not referenced by the two proof modules or by
the files above): `convex/betterAuth/_generated/api.ts`,
`convex/betterAuth/_generated/dataModel.ts`, and
`convex/betterAuth/_generated/server.ts` — those three only type the Better
Auth component's _own_ internal function definitions
(`convex/betterAuth/adapter.ts`, `auth.ts`, `generatedSchema.ts`), which this
fixture does not include and does not need; `component.ts` has no import
dependency on any of them.

These files are generated output (originally produced by `npx convex dev` /
`npx convex codegen` in the real starter). They are not hand-edited for
behavior and are not the schema source of truth; they are frozen here as a
fixed proof snapshot, matching the "exact allowlist" requirement for retained
generated sets in `wenext_internal.md` §15.4.
