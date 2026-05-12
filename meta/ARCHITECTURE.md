# Architecture

Trellis is an opinionated Nuxt module and app framework around one backend model: Convex owns app data and business rules, Nuxt projects that model into browser and server surfaces, and MCP projects it into agent workflows.

The implementation is the source of truth. Root foundation docs describe the maintained shape in the repository today, not older planning layouts.

## Repo Surfaces

```text
src/                  package source
  module.ts           Nuxt module entry
  cli/                trellis init/add/doctor/upgrade/explain
  eslint/             framework-specific lint rules
  module-internals/   setup, options, and codegen internals
  runtime/            published runtime surfaces
packages/
  trellis-bridge/     package-author bridge tooling and component bridge runtime
apps/
  docs/               hosted user-facing documentation
  harness/            maintainer integration harness and e2e target
examples/             maintained runnable reference apps
labs/                 archived or experimental concept material
tests/                root unit, Nuxt, server, browser, e2e, fixtures, support
adr/                  accepted architecture decision records
```

Root docs are maintainer- and agent-facing. `apps/docs/content/docs/**` is the user-facing product documentation.

## Package Surfaces

The root package exports the Nuxt module and explicit subpaths for public runtime APIs. The generated API surface in `apps/docs/content/docs/13.api-reference/7.api-surface.md` is the detailed inventory.

Maintained public subpaths include:

- `@lupinum/trellis`
- `@lupinum/trellis/auth`
- `@lupinum/trellis/args`
- `@lupinum/trellis/backend`
- `@lupinum/trellis/composables`
- `@lupinum/trellis/mcp`
- `@lupinum/trellis/server`
- `@lupinum/trellis/testing`
- `@lupinum/trellis/type-primitives`
- `@lupinum/trellis/workspace`

Packaged integration bridge APIs live in `@lupinum/trellis-bridge`, not in the
core Trellis package.

Nuxt aliases and auto-imports are separate from package exports. Do not treat generated aliases such as `#trellis/mcp` or server auto-imports as package subpaths.

## Official Starters

Current first-class starters are:

- `public`
- `personal`
- `workspace`
- `workspace-mcp`

MCP remains a workspace capability. `workspace-mcp` is the first-class template
name for the agent-enabled workspace starter.

Canonical CLI shape:

```bash
trellis init <name> --template public|personal|workspace|workspace-mcp
trellis add entity <name>
trellis add uploads
trellis add operation <name> --kind safe|destructive
trellis doctor
trellis upgrade --check
trellis explain operation <id>
```

## Canonical App Shape

Generated and maintained apps converge on the feature-folder model. Public apps omit the auth and permission folders until those capabilities are added.

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
  permissions/
  features/
shared/
  features/
app/
  features/
  pages/
server/
  api/
  mcp/
```

The rule is simple: routes and shell files stay thin; product behavior goes into feature folders. Runtime-neutral contracts live under `shared/features/*`. Convex business code lives under `convex/features/*`. UI slices live under `app/features/*`.

Feature folders expose framework inventory through `defineFeature(...)` and `composeFeatures(...)`. The composed manifest merges schema, permissions, tenant-scoped tables, global tables, capabilities, and operations so generated code, examples, and `doctor` do not maintain parallel lists.

## Runtime Model

The protected backend decision path is:

1. principal
2. actor
3. guard
4. load
5. authorize
6. handler

Observation is emitted around guard, authorization, destructive-operation, MCP, and trust-boundary decisions rather than as a guaranteed final post-handler phase.

This model applies across browser UI, Nitro server routes, trusted server callers, webhooks, and MCP tools. Transports differ; app policy should not.

## Trust Boundaries

Trellis separates transport identity from app identity.

- A principal describes how the call arrived.
- An actor describes who that principal is inside the app.
- Guards and authorization decide whether the actor can do the work.

Forwarded principals are accepted only on verified trusted-forwarding paths. Public args are not identity. Webhook, server, and MCP callers must cross an explicit trust boundary before they can act for a user or service.

## Tenant And Permission Boundaries

Tenant-aware apps rely on runtime-enforced isolation, not naming convention alone.

Permission state is backend-owned. The frontend may receive projected `_can` data or generated permission helpers, but those are reflections of backend truth. UI capability checks are not the source of authorization.

Unsafe and cross-tenant access paths must be explicit and narrow. They exist for known boundary cases such as membership resolution, token lookup, or operator views, not as shortcuts around the model.

## Destructive Work

First-party app UX may use ordinary guarded destructive handlers.

Cross-surface, shared, or agent-facing destructive work uses operation-backed preview and execute flows. MCP destructive tools must be operation-backed so the agent path has a preview, confirmation token, execution boundary, and drift check.

## Observability

Observability belongs at trust and decision boundaries. It must not become business identity.

Correlation IDs, transport metadata, and observation envelopes stay in runtime or transport state. Query cache identity must ignore observation metadata such as `__trellis`.

Trellis owns the semantic event vocabulary and delivers events through evlog. Apps configure capture and delivery behavior; they do not redefine the framework event model.

## Component Bridge

Most apps do not need a component bridge.

The bridge is for packaged Trellis-aware integrations that need stable host refs and managed host files while keeping internal component refs private. Bridge-owned tooling in `@lupinum/trellis-bridge` installs, regenerates, inspects, and checks bridge manifests. `createComponentBridge(...)` signs forwarding envelopes into component refs, but guards and app-owned actor logic still run.

Product packages own their public setup flow. For Ginko CMS specifically,
Trellis bridge mechanics remain internal infrastructure; consumer setup belongs
to `ginko-cms init`, `ginko-cms doctor`, and package-owned docs.

## Maintained Examples

`examples/01` through `08` are maintained framework references.

- `01 -> 02 -> 03 -> 04` is the beginner ladder.
- `03-team-workspace` is the canonical protected app.
- `04` shows server integrations on the workspace model.
- `05` and `06` cover advanced authorization and tenant models.
- `07` is the maintained MCP reference.
- `08` is the maintained component-boundary reference.

Examples are not identical to CLI templates, but they must not contradict the framework model.

## Harness And Labs

`apps/harness/` is maintainer infrastructure: local development, integration testing, e2e target coverage, auth, trusted-forwarding, and MCP verification. It is not the public product story.

`labs/` is archived and experimental concept material. It can pressure future framework decisions, but it is not canonical documentation or starter surface.

## Enforcement

Trellis should fail on drift instead of documenting drift.

Important guards include:

- `trellis doctor`
- root repo policy checks
- docs link checks
- generated API surface checks
- package export checks
- type tests
- maintained example tests
- ESLint rules for framework boundaries

If docs, generated starters, examples, and tests disagree, fix the disagreement directly.
