# Sprint 18: Component Bridge Signed Forwarding Root Wrapper Cutover

## Goal

Make the retained component bridge example pass on signed forwarding only.

By the end of this sprint, the component mini CMS root domain functions should
call their generated internal bridge wrappers with `_trellisForwarding`
envelopes, not raw `principal` args. This closes the failure exposed by Sprint
17 and proves the full bridge path:

```text
root public/protected handler
  -> signed forwarding into generated root bridge wrapper
  -> signed forwarding into component function
  -> component principal/actor/guard/handler
```

The important rule is still the 1.0 rule: a valid forwarding envelope
authenticates the forwarding boundary only. The component backend remains
authoritative for principal, actor, guard, load, authorize, and handler behavior.

## Why This Sprint Comes Next

Sprint 17 removed Convex operation implementation imports from active MCP tools.
Its verification exposed a separate bridge failure in
`examples/08-component-mini-cms test`:

```text
Forwarded `principal` is only allowed on verified trusted forwarding paths.
```

That failure is correct. The mini CMS root domain currently passes raw
`principal` into generated internal bridge wrappers:

```ts
ctx.runMutation(bridgeApi.create, { ...args, principal })
```

The internal bridge wrapper resolves principal through the trusted-forwarding
path, so raw identity args must fail. We should fix the caller boundary instead
of loosening bridge principal resolution or adding a raw compatibility path.

## Current State

- `createComponentBridge()` already signs the root-wrapper-to-component call with
  `transport: "bridge"` and exact component function refs.
- `createComponentBridge()` internal wrapper customization already expects signed
  forwarding before `getForwardedPrincipal(...)` accepts principal payloads.
- `examples/08-component-mini-cms/convex/features/pages/domain.ts` still passes
  raw `principal` into `bridgeApi.*` internal wrappers.
- `examples/08-component-mini-cms test` fails on the raw root-wrapper principal
  hop, not on descriptor binding.
- `createTrustedForwardingEnvelopeArgs(...)` already exists as the focused
  signing helper for Convex call args.

## Non-Goals

- Do not reintroduce raw `_trustedForwardingKey` or `_trustedForwarding`.
- Do not teach component bridge callers to pass public `principal` args.
- Do not add a bridge compatibility mode.
- Do not redesign Ginko bridge manifests.
- Do not migrate full Ginko CMS in this sprint.
- Do not move `tool.fromOperation(...)` or MCP safety-lane cleanup into this
  sprint.
- Do not broaden `createComponentBridge()` with a generic adapter unless the
  mini CMS call sites prove a repeated local helper is not enough.

## Work Items

### 1. Identify The Root Wrapper Boundary

- [x] Trace every `bridgeApi.*` call in
      `examples/08-component-mini-cms/convex/features/pages/domain.ts`.
- [x] Classify each call by purpose: query, mutation, or action.
- [x] Identify the exact root bridge wrapper function ref expected by the
      internal wrapper verifier.
- [x] Confirm anonymous calls still pass no forwarding envelope and no principal
      payload.

### 2. Replace Raw Root Wrapper Principal Args

- [x] Replace `bridgePrincipalArgs(...)` with a helper that returns either `{}` for
      anonymous principal or signed forwarding args for authenticated principals.
- [x] Use `createTrustedForwardingEnvelopeArgs(...)` with
      `transport: "bridge"`.
- [x] Set purpose from the called root wrapper operation:
      `query`, `mutation`, or `action`.
- [x] Set `functionRef` to the exact generated root bridge wrapper ref, not the
      component ref.
- [x] Preserve app args and keep `principal` only inside `_trellisForwarding`.
- [x] Use the existing `CONVEX_TRUSTED_FORWARDING_KEY` configuration path.

### 3. Preserve Component Bridge Internal Signing

- [x] Keep `createComponentBridge()` signing the second hop into component refs.
- [x] Do not collapse the two hops into one envelope; each verifier should check
      the function ref for the function it is about to run.
- [x] Add or update tests proving both root-wrapper and component-wrapper
      envelopes use `transport: "bridge"`.

### 4. Strengthen Mini CMS Tests

- [x] Make `examples/08-component-mini-cms test` pass.
- [x] Add an assertion that raw public `principal` args into the root wrapper are
      rejected.
- [x] Add an assertion that signed root-wrapper forwarding preserves the
      principal payload without exposing it as a plain app arg.
- [x] Keep the existing descriptor-backed publish operation source assertions.

### 5. Add Focused Bridge Regression Coverage

- [x] Update `tests/unit/create-component-bridge.test.ts` if needed so the root
      wrapper and component wrapper expectations are clear.
- [x] Add a focused regression check if the example test is not enough to prove
      exact root wrapper `functionRef` validation.
- [x] Keep the regression in tests, not runtime source scanning.

### 6. Update Trackers

- [x] Mark only the bridge signed-forwarding items actually completed in
      `meta/trellis-1.0-refactor-plan.md`.
- [x] Record any remaining Ginko bridge migration work as pending.
- [x] Update this sprint plan with exit notes before committing.

## Verification

Focused bridge tests:

```bash
pnpm --dir examples/08-component-mini-cms test
pnpm exec vitest run --project=unit tests/unit/create-component-bridge.test.ts
```

Regression checks from adjacent slices:

```bash
pnpm exec vitest run --project=unit \
  tests/unit/trusted-forwarding.test.ts \
  tests/unit/functions-defineTrellis.test.ts \
  tests/unit/mcp-descriptor-boundary.test.ts
```

Surface and cross-repo checks:

```bash
pnpm run check:docs:api-surface
pnpm run check:publish-surface
pnpm run check:refactor:surface:inventory
pnpm --dir ../ginko-cms run test:types
```

Known non-gates unless fixed separately:

```bash
pnpm run test:types
pnpm --dir examples/07-mcp-reference typecheck
pnpm --dir examples/03-team-workspace typecheck
```

Current unrelated failures include Vue Router type identity drift, generated API
typing drift, and Convex dependency-version type drift.

## Acceptance Criteria

- [x] `examples/08-component-mini-cms test` passes.
- [x] Mini CMS root domain no longer passes raw `principal` to `bridgeApi.*`.
- [x] Authenticated root-wrapper calls use `_trellisForwarding` with
      `transport: "bridge"`.
- [x] Root-wrapper envelopes bind the exact generated root bridge wrapper
      function ref.
- [x] Component-wrapper envelopes still bind the exact component function ref.
- [x] Anonymous bridge calls remain anonymous and do not require forwarding.
- [x] Raw principal args into forwarding-protected bridge wrappers fail closed.
- [x] No raw forwarding parser, compatibility shim, duplicate bridge registry, or
      broad adapter is added.
- [x] 1.0 tracker reflects the completed bridge forwarding proof.
- [x] Verification commands above pass except explicitly listed non-gates.
- [x] Sprint changes are committed after verification.

## Exit Notes

- [x] Mini CMS root domain calls now sign authenticated bridge wrapper calls with
      `_trellisForwarding` and no longer pass raw `principal` args.
- [x] `createComponentBridge()` internal wrappers now accept signed forwarding
      transport fields instead of raw principal validators.
- [x] Structured handlers can opt into `trustedForwardingTransport: "bridge"` so
      component functions can verify bridge-origin envelopes without weakening
      the default server transport.
- [x] Component bridge definitions can provide explicit component function refs
      when generated component refs are opaque at runtime.
- [x] Root-wrapper envelopes bind the generated root wrapper ref; the component
      hop binds the app args and component ref before backend authorization.
- [x] Full Ginko bridge migration remains pending in the cross-repo gate.
