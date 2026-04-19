# Trellis Final Spec

This file is the repaired source of truth for Trellis after the spec-alignment refactor.

It is intentionally narrower than older drafts. Anything not stated here is not part of the current product contract.

## 1. Product

Trellis is an opinionated app platform for repeated `Nuxt + Convex + Better Auth + MCP` apps.

Its job is to keep one backend/runtime model stable across:

- browser UI
- Nitro server routes
- trusted server callers
- MCP tools

It is not trying to be stack-neutral, framework-neutral, or transport-neutral.

## 2. Official Starters

First-class starters:

- `personal`
- `workspace`
- `cms`

MCP is not a separate archetype. It is a capability added to `workspace`.

Roadmap shapes, not product promises:

- `support-inbox`
- `admin-console`
- `agent-console`

## 3. Canonical CLI

Public CLI surface:

```bash
trellis init <name> --template personal|workspace|cms [--mcp]
trellis add mcp
trellis add uploads
trellis add operation <name> [--kind safe|destructive]
trellis doctor
```

Removed from the public product surface:

- `trellis init app`
- `trellis init auth`
- `trellis init permissions`
- `trellis init mcp`
- `workspace-mcp` as a starter name

## 4. Canonical App Tree

Every generated app converges on this tree:

```text
nuxt.config.ts
convex/
  auth.ts
  auth.config.ts
  convex.config.ts
  functions.ts
  http.ts
  schema.ts
  auth/
  domain/
  operations/
  permissions/
shared/
  schemas/
pages/
server/
  api/
  mcp/
```

This is load-bearing. Docs, starters, examples, tests, and `doctor` should all agree on it.

## 5. Runtime Model

The protected backend path is:

1. principal
2. actor
3. guard
4. load
5. authorize
6. handler
7. observe

This path remains the core of Trellis.

## 6. Trust Model

Forwarded `principal` data is only valid on verified trusted-caller lanes.

Implications:

- app principal resolvers must not trust raw public args
- examples and harnesses must use the trusted-caller helper instead of reading `args.principal` directly
- internal bridge/projection paths that forward principal must inject verified trusted-caller context explicitly

## 7. Tenant and Permission Model

Trellis keeps backend-owned permission projection and runtime tenant boundaries.

Key rules:

- tenant-aware apps use runtime-enforced isolation
- browser capability checks project from backend truth
- permission query paths follow the file-based Convex path format, e.g. `permissions/context.getPermissionContext`

## 8. Destructive Work

Two destructive patterns are allowed, but they are not equivalent.

Allowed:

- plain guarded destructive handlers for first-party app UX
- operation-backed preview/confirm/execute flows for shared, cross-surface, or agent-facing destructive work

Required:

- MCP destructive tools must be operation-backed
- generated destructive operation scaffolds must expose preview and execute entrypoints

## 9. Observability

Observability belongs at trust and decision boundaries, but it must not leak into business identity.

Required:

- correlation and transport metadata stay in runtime/transport state
- query cache identity ignores observation envelopes such as `__trellis`

## 10. Docs and Examples Contract

There are three repo surfaces:

1. the spec
2. the generated starters
3. the examples/docs

They must agree.

Rules:

- `examples/03-team-workspace` remains the canonical protected app
- examples in the public learning path must respect the canonical layout
- roadmap work belongs in `labs`, not in the public starter contract

## 11. Enforcement

Trellis should fail on drift instead of documenting drift.

Required checks:

- `doctor` validates canonical layout presence
- CLI tests validate generated trees
- repo tests validate doc/example references
- spec drift is fixed by changing the code or changing this file, not by adding narrative exceptions

## 12. Non-Goals

Not part of the current product:

- framework neutrality
- adapter marketplaces
- multiple parallel starter taxonomies
- dual path CLI compatibility
- spec claims that depend on external apps for proof

## 13. Current Quality Bar

The intended result is:

- one canonical CLI story
- one canonical app shape
- one trusted-caller model
- one destructive-work policy
- one repo-wide enforcement story

If the codebase, docs, and tests disagree, this file is wrong or the implementation is incomplete.
