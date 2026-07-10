# Packed typed-client fixture (vNext §5.8 proof 1)

Permanent release-gate fixture for the **typed Better Auth client** risk.

## What it proves

A packed Nuxt consumer resolves a **node_modules-resident** framework-free
`defineConvexAuthClient` helper (`better-convex-nuxt/auth-client`) and a
generated type registry (`addTypeTemplate`-shaped declaration), and:

- **(a)** a consumer definition with the `apiKey` client plugin makes the
  narrowed non-null `useConvexAuth().client` expose `apiKey.create` with correct
  parameter and return types (`{ id: string; key: string }`), asserted by
  `nuxi typecheck` — including a `@ts-expect-error` that rejects an unknown input
  field (proving the params are typed, not `any`);
- **(b)** a **base** consumer registering the typed empty fallback (a definition
  with no plugins) exposes only the base client after the same `if (client)`
  narrowing — `apiKey.create` is a type error (asserted with `@ts-expect-error`
  in a separate TypeScript program, per the vNext §8 isolation contract);
- **(c)** the definition generic preserves plugin tuples through a **mutable**
  merged `plugins` array (spread of a readonly tuple; better-auth's `plugins`
  option is a mutable array);
- **(d)** the definition compiles from its node_modules-resident location
  through the generated registry (internal §23 stop condition 20).

It also covers: two consecutive `nuxi prepare` runs in one process + type-
registry regeneration without stale types; a packed-output scan for source-
machine absolute paths and undeclared dependency imports; and the Ginko
`defu` decision-12 merge semantics (vNext §10.2).

## Key mechanism finding

`InferRegisteredConvexAuthClient` must feed the resolved options to
`VueAuthClient<Options>` **without re-intersecting the full
`BetterAuthClientOptions`**. That broad type carries an optional
`plugins?: BetterAuthClientPlugin[]`; intersecting it collapses the resolved
plugin tuple and silently degrades plugin-method inference to `any`. The base
options are carried only via `Omit<BetterAuthClientOptions, 'baseURL' |
'plugins'>`. The pre-existing repo probe (`test/unit/better-auth-client-plugin-
types.test.ts`) only asserted key **existence** (`HasKey`), which `any`
satisfies; this fixture asserts the stronger typedness.

## Phase-0 prototype note

The currently packed `better-convex-nuxt` (0.5.0) does not yet ship the Phase 3
`/auth-client` entry. `consumer/scripts/inject-auth-client-entry.mjs` (run as a
`postinstall`) injects a prototype entry into the installed packed package so the
typing mechanism is proven from a real node_modules location today. **Phase 3**
replaces the injected prototype with the published `/auth-client` entry and
swaps the committed registry template for the real module-generated one; the
consumer definition and assertions stay.

## Run

```bash
# from the repository root
bash test/proofs/packed-typing/verify.sh
```

Individual steps (from `consumer/`):

```bash
pnpm install                            # installs tarball + injects /auth-client
./node_modules/.bin/nuxi prepare
./node_modules/.bin/nuxi typecheck                      # (a) (c) (d)
./node_modules/.bin/tsc -p base-fallback/tsconfig.base-fallback.json  # (b)
node scripts/two-build-hmr.mjs          # two-build + registry regeneration
```

And from the fixture dir:

```bash
node scan-packed-output.mjs   better-convex-nuxt-<version>.tgz  # path/import scan
node defu-merge-proof.mjs                                       # Ginko §10.2 defu
```

## Files

- `consumer/convex-auth.ts` — host definition WITH `apiKeyClient()`.
- `consumer/types/better-convex-nuxt-auth-client.d.ts` — generated-registry
  template (mirrors `addTypeTemplate` output shape).
- `consumer/composables/proofAssertions.ts` — criteria (a) + (c).
- `consumer/base-fallback/**` — separate program for criterion (b).
- `consumer/scripts/inject-auth-client-entry.mjs` — prototype `/auth-client`.
- `consumer/scripts/two-build-hmr.mjs` — two-build + regeneration proof.
- `scan-packed-output.mjs` — packed-tarball path/import scan.
- `defu-merge-proof.mjs` — Ginko decision-12 defu proof.
