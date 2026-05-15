# Trellis Next Major Spec

Status: discussion draft
Target: Trellis 1.0 / next major
Date: 2026-05-09

This document describes the desired next-major shape of Trellis. It is not a
current implementation document. The goal is to give the team a concrete target
for discussion before choosing follow-up refactors.

The important premise is simple: Trellis should remain an opinionated framework
for serious Nuxt + Convex apps. It should not become a generic utility library.
The refactor target is not smaller ambition. The target is a smaller, calmer
surface around the same security model.

## Executive Summary

Trellis next major should be the safest and fastest way to build workspace-style
Nuxt + Convex apps with first-class agent support.

The current architecture has the right spine:

```text
principal -> actor -> guard -> load -> authorize -> handler
```

That spine stays.

MCP stays a projection of the same backend model, not a second backend.
Destructive agent-facing work stays operation-backed with preview, confirmation,
drift detection, replay protection, and audit.

The next major changes the shape around that spine:

- Move component bridge out of core into a packaged-integration package.
- Make Ginko CMS the reference user of that bridge package, not an exception.
- Collapse the visible product into progressive layers: Core, Auth, Workspace,
  Agent/MCP, Platform Integrations.
- Simplify public imports and authoring APIs.
- Replace identity-in-args and long-lived shared forwarding secrets with a
  signed, short-lived forwarding envelope.
- Make operations the canonical unit for cross-surface business work.
- Make `trellis doctor` an adoption and security dashboard.
- Replace string-template sprawl with tested fixture apps plus codemods.
- Add `trellis upgrade` and `trellis explain`.
- Keep semantic observability, but move delivery implementation out of core.
- Harden generated workspace MCP so key -> principal -> actor -> permission ->
  tool execution is proven end to end.

The desired result:

```text
Create app.
Add feature.
Protect handler.
Expose operation to MCP.
Run doctor.
```

Advanced machinery exists, but it appears only when the app crosses the
boundary that needs it.

## Release Scope

This document is the north-star target. It is not permission to run one giant
rewrite.

The next major must ship:

- bridge removed from the core public exports;
- production-safe trusted forwarding that no longer passes raw shared secrets or
  public identity fields as Convex args;
- operation-first destructive MCP;
- a tested `workspace-mcp` fixture proving token -> principal -> actor ->
  permission -> tool execution;
- fixture-based starter generation for `public`, `personal`, `workspace`, and
  `workspace-mcp`;
- `doctor` checks for forwarding, tenant boundaries, destructive MCP,
  confirmation stores, and rate-limit stores;
- one typed unsafe permit mechanism for unsafe handlers, tenant escapes, and
  generic MCP custom tools;
- a shared inventory engine with versioned JSON output for `doctor`,
  `upgrade --check`, public-surface checks, and future `explain` commands;
- a public-surface budget enforced in CI.

The next major may ship if the foundation is ready:

- `trellis explain`;
- `trellis upgrade`;
- observability delivery extraction;
- ESLint package extraction;
- declaration-registry cleanup beyond the paths needed for the new inventory
  model.

Before implementation commits to the new APIs, Phase 0 must prove three
experiments:

1. operation-first MCP can work without importing Convex implementation code
   into Nitro/server tool files;
2. signed forwarding envelopes have stable hashing, key rotation, expiry, and
   replay behavior;
3. fixture-generated `workspace-mcp` is understandable and passes the full MCP
   trust path.

Each Phase 0 experiment must produce a short go/no-go note. Partial success is
allowed only when the fallback authoring shape is written down and still meets
the safety invariants.

## ADR Impact

This spec amends or supersedes several current ADRs:

- ADR 0002 starters: amended. MCP remains conceptually a workspace capability,
  but `workspace-mcp` becomes the canonical CLI starter name if the fixture
  proves clearer than `workspace --mcp`.
- ADR 0004 protected backend path: retained, with possible public/protected/
  unsafe builder spelling changes and stricter fail-closed setup behavior.
- ADR 0006 trusted forwarding: superseded by signed forwarding envelopes.
- ADR 0008 MCP as workspace capability: retained; the user-facing starter name
  may change.
- ADR 0011 raw MCP projection before DSL: retained; operation-first MCP is not
  a resource DSL.
- ADR 0010 rate limiting boundaries: amended by production MCP rate-limit store
  requirements and store self-tests.
- ADR 0013 feature manifests/app inventory: amended by `defineAppInventory`
  and the shared inventory engine.
- ADR 0014 component bridges: retained but extracted to
  `@lupinum/trellis-bridge`.
- ADR 0016 evlog observability: amended. Trellis keeps the event vocabulary and
  redaction contract; delivery may move behind a constrained sink interface.

## Adoption Boundary

Do not use Trellis just because an app needs a Convex query helper. Use Trellis
when the team wants one reviewable backend model across browser, server,
workspace, bridge, and agent surfaces.

## Design Principles

### Keep The One Backend Model

Browser UI, Nitro routes, webhooks, component package bridges, and MCP tools
must share the same backend authorization model.

Transport-specific code may authenticate and shape a request. It must not own
domain authorization.

### One Source Of Truth Per Concept

Every important concept must have one owner.

- Handlers own behavior.
- Operations own cross-surface business actions.
- Feature manifests own inventory.
- Backend permissions own authorization truth.
- UI `_can` data owns only projection.
- MCP tools own transport projection, not policy.
- Bridge manifests own package integration files, not app behavior.
- Observability events own decision explanation, not identity.

Derived data is allowed only when it is rebuildable from the canonical source
and covered by drift tests.

### Make The Safe Path Shortest

The safe path must be shorter than the unsafe path.

Common app code should not require bridge concepts, transport confirmations,
observability internals, generic MCP handlers, or low-level forwarding fields.

Unsafe and advanced paths should be explicit, narrow, named, and checkable.

### Prefer Hard Cutovers

This is a next-major spec. Do not preserve old and new public paths side by
side unless the team explicitly chooses a migration compatibility window.

The preferred shape is:

1. Build the new path.
2. Port maintained examples and Ginko CMS.
3. Add codemods where useful.
4. Delete the old path.

### MCP Is A Serious Boundary

MCP support does not mean "tool wrapper".

MCP-ready means:

- authenticated or explicitly public tools;
- capability-aware discovery;
- backend-owned permission checks;
- tenant enforcement in Convex;
- trusted forwarding over a verified boundary;
- result envelopes that separate structured data from model-facing text;
- rate limiting at ingress;
- semantic observability;
- destructive operations through preview/confirm/execute.

## Non-Goals

Trellis next major should not become:

1. Stack-neutral. Nuxt + Convex is the product constraint that lets Trellis make
   strong decisions.
2. Backend-neutral. Convex owns app data and business rules.
3. Auth-provider-neutral by default. Better Auth remains the foundation until a
   real second provider earns support.
4. A generic MCP SDK. MCP is valuable here because it projects the app backend.
5. A UI component library. Auth and framework glue components are enough.
6. A plugin ecosystem. Packaged integrations use bridge; core does not bend
   around arbitrary third-party extension points.
7. A hidden resource DSL. Auth, tenant, and destructive behavior must stay
   inspectable.

Nuxt + Convex + Better Auth + TypeScript + MCP remains the lane.

## Product Layers

The next major should present Trellis as layers. These layers are product and
documentation boundaries first. They do not automatically imply separate npm
packages.

### Layer 1: Trellis Core And Backend

Purpose: make Nuxt + Convex app development boring.

Docs may present this as two mental sublayers even if it stays in one package:

- Core App Runtime: Nuxt module, Convex client/server helpers, uploads, and
  basic setup.
- Backend Model: public/protected/unsafe builders, operations, projection
  metadata, and pipeline testing.

Includes:

- Nuxt module.
- Convex URL and site URL wiring.
- SSR/live query composables.
- mutation/action composables.
- upload helpers.
- server Convex callers.
- `defineArgs`.
- public/protected/unsafe backend builders.
- the protected handler pipeline machinery.
- operation definitions and projection metadata.
- minimal testing helpers.
- core `doctor` setup checks.

Does not require:

- Better Auth;
- workspaces;
- tenant isolation;
- MCP;
- component bridges;
- feature manifests for simple public apps.

Core should be useful for public and simple authenticated apps without making
users learn the full platform.

### Layer 2: Trellis Auth

Purpose: make identity explicit and reusable.

Includes:

- Better Auth integration.
- auth proxy and route safety.
- principal resolution.
- actor resolution.
- auth composables and auth state.
- fail-closed auth wiring.

Auth plugs identity into the backend pipeline:

```text
principal -> actor -> guard -> load -> authorize -> handler
```

### Layer 3: Trellis Workspace

Purpose: make roles, permissions, and tenancy reviewable.

Includes:

- guards and permission definitions;
- permission projection;
- `_can` projection helpers;
- tenant isolation wrappers;
- typed unsafe permits;
- feature manifests;
- `composeFeatures`;
- tenant and permission doctor checks;
- workspace starter.

Feature manifests stay inventory, not business logic.

### Layer 4: Trellis Agent / MCP

Purpose: expose app operations to agents without creating a side backend.

Includes:

- MCP runtime.
- tool projection.
- capability-aware discovery.
- result envelopes.
- sessions.
- ingress rate limiting.
- signed forwarding envelope integration.
- destructive operation preview/confirm/execute.
- MCP-specific doctor checks.
- agent-safe denial explanations.

MCP is enabled only when requested.

### Layer 5: Trellis Platform Integrations

Purpose: support reusable Trellis-aware packages such as Ginko CMS.

Includes:

- component bridge runtime;
- bridge manifests;
- bridge CLI;
- bridge drift checks;
- managed host edits;
- package integration test helpers.

This layer is not part of the normal app-building story.

## Package Shape

The first next-major package split should be conservative. Do not turn product
layers into npm packages unless a dependency or release-boundary problem proves
that the split pays for itself.

Preferred 1.0 package shape:

```text
@lupinum/trellis              Core, backend, auth, workspace, MCP subpaths
@lupinum/trellis-bridge       Packaged component integrations
@lupinum/trellis-eslint       Optional lint rules
@lupinum/trellis-cli          CLI binary and codemods, if not bundled
@lupinum/trellis-observability Optional delivery sinks, if extraction proves useful
```

Auth, Workspace, and MCP are first product layers and public subpaths:

```text
@lupinum/trellis/backend
@lupinum/trellis/auth
@lupinum/trellis/workspace
@lupinum/trellis/mcp
@lupinum/trellis/server
@lupinum/trellis/testing
```

They should become packages only after the internal dependency graph proves that
separate versioning will not create install or peer-dependency friction.

The core package rule is fixed:

`@lupinum/trellis` must no longer export component bridge APIs.

The root `@lupinum/trellis` package may expose common Core/Auth/Workspace/MCP
subpaths. It must not reintroduce bridge, ESLint, CLI, or observability delivery
surface into every consumer.

### Public Imports

Teach a small import map:

```text
@lupinum/trellis              Nuxt module and core app helpers
@lupinum/trellis/backend      Convex backend builders and operations
@lupinum/trellis/auth         principal, actor, guards, permissions
@lupinum/trellis/workspace    tenant isolation and feature manifests
@lupinum/trellis/mcp          MCP runtime and operation projection
@lupinum/trellis/server       Nitro/server helpers
@lupinum/trellis/testing      test harness helpers
```

Advanced packages:

```text
@lupinum/trellis-bridge       packaged component integrations
@lupinum/trellis-observability delivery sinks for normalized Trellis events
@lupinum/trellis-eslint       optional framework lint rules
@lupinum/trellis-cli          CLI binary and codemods
```

Do not teach internal repo structure as public API.

### Dependency Graph Rules

- Core/backend must not import bridge.
- Core/backend must not import ESLint.
- Core/backend must not require evlog delivery at runtime.
- MCP may depend on backend, auth, workspace concepts, operations, and trusted
  forwarding. MCP server tools may import shared descriptors and generated refs;
  they must not import Convex implementation modules.
- Bridge may depend on backend operation metadata and trusted forwarding.
- Bridge must not be imported by normal app starters.
- CLI may orchestrate every package, but package runtimes must not depend on
  CLI code.
- Doctor and explain may do heavier analysis; app runtime must not.

## Desired Repo Structure

The source tree should match domain boundaries:

```text
src/
  core/
    module/
    config/
    diagnostics/
    public-surface/

  convex/
    client/
    server/
    query/
    mutation/
    pagination/
    upload/
    testing/

  auth/
    better-auth/
    principal/
    actor/
    guards/
    permissions/
    projection/

  workspace/
    tenant/
    feature-manifest/
    visibility/
    unsafe-permits/

  operations/
    define-operation.ts
    projection.ts
    preview.ts
    confirmation.ts
    audit.ts

  mcp/
    runtime/
    tools/
    operation-tools/
    confirmation/
    capabilities/
    sessions/
    rate-limit/
    result-envelope/

  trusted-forwarding/
    envelope.ts
    signing.ts
    validation.ts
    convex-validators.ts

  observability/
    events/
    envelope/
    capture/
    summaries/

  cli/
    init/
    add/
    doctor/
    upgrade/
    explain/
    bridge-adapter/

  eslint/
```

Component bridge code moves to `packages/trellis-bridge/src`.

The important cleanup is responsibility separation. Large runtime files should
not coordinate auth, tenant isolation, operations, bridge forwarding, MCP
projection, and observability in one place.

## Shared Contract And Convex Implementation Boundary

Operation-first MCP must not require Nitro/server files to import Convex server
implementation code.

The boundary is:

```text
shared/features/*     args, result schemas, permission keys, operation descriptors
convex/features/*     handler and operation implementations
server/mcp/*          shared descriptors plus generated Convex refs
app/features/*        shared contracts plus generated API refs
bridge manifests      shared descriptors plus generated host bridge refs
```

Trellis should distinguish descriptors from implementations:

```ts
// shared/features/projects/operations.ts
export const deleteProjectDescriptor = defineOperationDescriptor({
  id: 'projects.delete',
  kind: 'destructive',
  args: deleteProjectArgs,
  permission: projectDeleteKey,
})
```

```ts
// convex/features/projects/operations.ts
export const deleteProject = implementOperation(deleteProjectDescriptor, {
  guard: projectDelete,
  load,
  authorize,
  preview,
  execute,
})
```

```ts
// server/mcp/tools/delete-project.ts
export default mcp.tool.operation(deleteProjectDescriptor, {
  preview: api.features.projects.operations.previewDeleteProject,
  execute: api.features.projects.operations.executeDeleteProject,
})
```

If Experiment 3 does not prove the one-liner safely, the explicit checked
binding form above is the accepted fallback. It is still a good API when Trellis
can verify that descriptor id, kind, args, permission key, preview ref, execute
ref, and tool metadata all describe the same operation.

The dream one-liner is valid only if the imported value is a shared descriptor
or generated operation handle, not a Convex implementation object:

```ts
export default mcp.tool.operation(projects.deleteProject)
```

But the accepted invariant is stricter than the syntax:

- MCP tool files do not import Convex-only implementation modules.
- Vue app files do not import Convex-only implementation modules.
- Bridge manifests do not call private component refs directly from app code.
- Operation metadata is available to doctor, explain, MCP, and upgrade without
  fragile source scanning.
- Before Convex codegen runs, operation metadata either works from descriptors
  or fails with a clear diagnostic, never with a cryptic `never` type.

### Permission Descriptor Boundary

Shared code and MCP tool files should reference permission keys, not backend
permission implementations.

```ts
// shared/features/projects/permissions.ts
export const projectDeleteKey = definePermissionKey('projects.delete')
```

```ts
// convex/features/projects/permissions.ts
export const projectDelete = definePermission({
  key: projectDeleteKey,
  check: hasWorkspaceRole('admin'),
})
```

```ts
// server/mcp/tools/delete-project.ts
export default mcp.tool.operation(deleteProjectDescriptor, {
  permission: projectDeleteKey,
  preview: api.features.projects.operations.previewDeleteProject,
  execute: api.features.projects.operations.executeDeleteProject,
})
```

Backend handlers enforce the real permission implementation. MCP discovery and
operation descriptors use the key for visibility, inventory, and drift checks.

### Operation Descriptor Invariants

Operation descriptors must not become a second source of truth.

`implementOperation(descriptor, implementation)` is the checked binding point.
It must preserve descriptor id, kind, args, result schema, and permission key.
Generated preview/execute projections must carry the same descriptor id and
projection kind.

Doctor fails when:

- descriptor kind and projection kind disagree;
- descriptor args and implementation args diverge;
- descriptor result or preview result schema and generated projection metadata
  diverge;
- descriptor permission key and implementation permission key diverge;
- destructive operation metadata lacks preview or execute projection;
- MCP binding points at refs whose generated metadata does not match the
  descriptor id.

## What Stays

### Protected Handler Pipeline

Keep the structured handler model. It is the framework spine.

Candidate explicit authoring shape:

```ts
export const updateProject = mutation.protected({
  args: updateProjectArgs,
  guard: projectWrite,
  load: async (ctx, args) => ({
    project: await ctx.db.required(args.id, 'Project'),
  }),
  authorize: {
    label: 'project.update',
    check: (actor, { project }) => actor.workspaceId === project.workspaceId,
  },
  handler: async (ctx, args, { project }) => {
    await ctx.db.patch(project._id, { name: args.name })
  },
})
```

The exact builder spelling needs an API spike. The decision is not that
`.protected` must be the final syntax. The decision is:

- public handlers are explicitly public;
- protected handlers declare guard/authorization behavior;
- unsafe handlers use a typed unsafe permit;
- missing guard or missing runtime identity never accidentally means public.

Possible final spellings:

```ts
query.public(...)
mutation.protected(...)
mutation.unsafe(...)
```

or the current Trellis builder shape if it can preserve the same explicit
public/protected/unsafe distinction without extra noise.

Record-specific authorization belongs after `load`. UI gates and route
middleware do not replace it.

### Backend-Owned Permissions

Keep backend permissions as the source of truth.

UI capability state remains derived:

- `usePermissions()`;
- `_can`;
- route affordances;
- MCP tool visibility.

Backend handlers still enforce authorization.

### Tenant Isolation

Keep runtime-enforced tenant isolation.

Improve inspectability through `doctor tenant`:

```text
Tenant model
  key: workspaceId
  index: by_workspace

Tenant-scoped tables
  projects       ok
  documents      missing by_workspace index

Global tables
  users          ok
  workspaces     ok

Escapes
  convex/auth/actor.ts:17      membership lookup
  convex/support/audit.ts:42   operator support view
```

### Feature Folders

Keep feature folders as ownership boundaries:

```text
shared/features/<feature>/
convex/features/<feature>/
app/features/<feature>/
```

Routes and shell files stay thin. Product behavior lives in features.

### Feature Manifests

Keep manifests as inventory:

```ts
export const projectsFeature = defineFeature({
  name: 'projects',
  schema: projectsTables,
  permissions: projectPermissions,
  tenant: {
    tables: ['projects'],
  },
  operations: [deleteProjectDescriptor],
  capabilities: [projectCapabilities],
})
```

Do not move business logic into manifests.

### Destructive Operations

Keep preview/confirm/execute for agent-facing destructive work.

The next major should make destructive authoring easier, not weaker.

```ts
export const deleteProject = destructiveOperation({
  id: 'projects.delete',
  args: deleteProjectArgs,
  guard: projectDelete,
  load: async (ctx, args) => ({
    project: await ctx.db.required(args.id, 'Project'),
    taskCount: await countProjectTasks(ctx, args.id),
  }),
  authorize: {
    label: 'project.delete',
    check: (actor, { project }) => actor.workspaceId === project.workspaceId,
  },
  preview: ({ project, taskCount }) => ({
    display: {
      summary: `Delete "${project.name}"`,
      warning: 'This cannot be undone.',
      affects: { projects: 1, tasks: taskCount },
    },
    confirm: {
      projectId: project._id,
      projectVersion: project.updatedAt,
      taskCount,
    },
  }),
  execute: async (ctx, args, { project }) => {
    await deleteProjectCascade(ctx, project._id)
  },
})
```

The operation definition is the source of truth for:

- preview ref;
- execute ref;
- operation metadata;
- MCP binding metadata;
- confirmation payload shape;
- audit metadata;
- doctor inventory;
- test helpers.

The implementation may use generated metadata or explicit thin exports. Users
must not hand-maintain mismatched operation ids, preview refs, execute refs, and
MCP bindings.

Preview is side-effect-free. It may read data, authorize, compute readiness, and
produce confirmation material. It must not mutate app data, call external
systems, enqueue jobs, or perform irreversible work.

Execution must re-run guard, load, authorization, tenant binding, and drift
checks after confirmation redemption. A successful preview is not an
authorization grant.

More precise wording for implementation:

```text
operation descriptor + checked projections = source of truth for preview and execute refs
operation implementation = source of truth for backend behavior
feature manifest = source of truth for feature inventory
app inventory = composed source for doctor/explain/MCP/upgrade
```

### Doctor

Keep and expand `trellis doctor`. It is a core product surface.

## What Changes

### 1. Component Bridge Leaves Core

Current issue:

The bridge is real for Ginko CMS and packaged Convex components, but most apps
do not need it. Keeping it in core makes every Trellis user see and pay for a
package-integration concern.

Next-major decision:

Move bridge runtime, manifests, CLI command, drift checks, and package author
docs into `@lupinum/trellis-bridge`.

Core Trellis knows only that trusted forwarding exists. It does not know about
component bridge manifests.

Desired bridge imports:

```ts
import { createComponentBridge } from '@lupinum/trellis-bridge/convex'
import { defineBridgeManifest } from '@lupinum/trellis-bridge/manifest'
```

Bridge CLI (post-1.0):

A generic `trellis-bridge` CLI is deferred to post-1.0. For 1.0 the bridge
package boundary is real but its surface stays runtime-only: manifest
rendering, drift checks, and the signed-forwarding helpers are exposed as
library APIs that the bridge consumer's own CLI uses. Ginko CMS ships
`ginko-cms bridge check/inspect/init/setup`; introducing a separate generic
CLI only pays off once a second bridge consumer needs it.

When 1.0 + 1 needs a generic CLI, the commands described in earlier drafts
(`trellis-bridge install/check/inspect <package>`) are a starting point —
read the manifest, render generated host files, check drift, inspect planned
edits — and should sit on the same library APIs Ginko's CLI uses today.

### 2. Ginko CMS Becomes The Reference Bridge Consumer

Ginko CMS is exactly the packaged integration that justifies the bridge:

- it ships a reusable Convex component;
- host apps need generated root refs;
- Ginko should keep internal component refs private;
- Ginko owns the user-facing install experience;
- bridge files must stay thin and drift-checkable.

Next-major alignment:

- Ginko depends on `@lupinum/trellis-bridge` for bridge internals.
- Ginko continues to expose `ginko-cms bridge check` and `ginko-cms setup`.
- Ginko docs do not require users to learn Trellis bridge concepts.
- Ginko bridge manifests remain the source of generated host files.
- Ginko bridge exports shrink as CMS operations converge.

Ginko rule:

```text
Trellis bridge powers package integration.
Ginko CMS owns product setup and product terminology.
```

### 3. Signed Forwarding Envelope Replaces Raw Shared Key Args

Current issue:

Trusted forwarding used to rely on public args carrying a raw shared key plus
identity-shaped forwarding payloads. That normalized identity-shaped args and
moved a long-lived secret through function inputs.

Next-major decision:

Forwarded identity travels in a signed, short-lived envelope.

Envelope shape:

```ts
type TrustedForwardingEnvelope = {
  v: 1
  kid: string
  iss: string
  aud: string
  jti: string
  sub: string
  principal: unknown
  delegation?: unknown
  transport: 'server' | 'webhook' | 'mcp' | 'bridge'
  purpose: 'query' | 'mutation' | 'action' | 'operation-preview' | 'operation-execute'
  functionRef: string
  argsHash: string
  issuedAt: number
  expiresAt: number
  signature: string
}
```

Convex verifies:

- key id is accepted;
- signature is valid;
- envelope is not expired;
- issuer/audience match this deployment;
- function ref matches;
- args hash matches;
- subject matches principal;
- delegation subject matches delegation;
- replay policy matches the purpose and operation class.

Normal public args must not contain `principal`, `delegation`, or raw forwarding
keys.

Generated validators should expose one reserved field:

```ts
_trellisForwarding: v.optional(v.string())
```

That field contains the signed envelope, not identity data.

The envelope is an integrity mechanism, not a confidentiality mechanism, unless
the implementation later chooses encryption. Principal and delegation payloads
must be minimal and non-secret. Actor resolution should still load app state
inside Convex.

A valid envelope authenticates the forwarding boundary. It does not grant
permission. Backend guards, tenant isolation, authorization, and destructive
confirmation still decide whether the operation may execute.

This section requires a dedicated security RFC before implementation. That RFC
must define:

- signing algorithm and key storage;
- whether Trellis uses HMAC, asymmetric signing, or a JWS-like format, and why;
- `kid` rotation and overlap windows;
- local key-rotation test workflow;
- exact canonical Convex args serialization for `argsHash`;
- exclusion of `_trellisForwarding`, `__trellis`, and transient transport
  metadata from `argsHash`;
- function ref identity format;
- maximum TTLs by purpose;
- clock-skew tolerance;
- replay policy by purpose;
- production nonce/redemption store requirements;
- canonical serialization test vectors for nested args, arrays, Convex ids,
  optional fields, and excluded metadata;
- principal and delegation validators used during envelope verification;
- maximum serialized envelope size;
- redaction behavior for invalid principal/delegation payloads;
- observable error taxonomy for invalid, expired, replayed, or mismatched
  envelopes.

The forwarding envelope RFC is a trusted-forwarding phase gating dependency.
Before Phase 0 sign-off, the team must name an owner for the RFC and choose at
least one security-aware reviewer outside the implementation author.
Implementation should not begin until the RFC has review sign-off.

Phase 0 may build throwaway or fixture-only forwarding spikes before RFC
sign-off. Production implementation, public API, and migration work wait for
RFC sign-off.

### 4. MCP Uses Blessed Projection Lanes

Current issue:

The MCP surface has too many similar choices:

- toolkit `defineMcpTool`;
- Trellis `defineTool`;
- `defineMcpApp(...).tool(...)`;
- `defineMcpApp(...).tool.fromOperation(...)`;
- operation refs;
- transport confirmations;
- backend confirmations.

Next-major decision:

Teach three blessed MCP lanes. Simple reads and writes project protected
backend refs. Cross-surface, audited, reusable, previewed, or destructive work
uses operations. Destructive MCP always uses operations.

```ts
mcp.tool.query(...)
mcp.tool.mutation(...)
mcp.tool.operation(...)
```

Generic custom tools remain, but they are advanced:

```ts
mcp.tool.custom({
  permit: unsafe.permit({
    kind: 'externalService',
    reason: 'Calls a non-Convex external service after backend policy is checked.',
    scope: ['linear'],
  }),
  ...
})
```

Destructive tools are only exposed through `mcp.tool.operation(...)`.

Example:

```ts
export default mcp.tool.operation(deleteProjectDescriptor, {
  name: 'delete-project',
  permission: projectDeleteKey,
  preview: api.features.projects.operations.previewDeleteProject,
  execute: api.features.projects.operations.executeDeleteProject,
})
```

The tool should derive or verify:

- schema;
- preview ref;
- execute ref;
- destructive annotations;
- confirmation requirements;
- audit binding;
- doctor inventory.

If derivation is blocked by Convex codegen or runtime boundaries, explicit
checked bindings are the accepted fallback. The fallback still must let Trellis
prove that the descriptor, refs, destructive annotations, tenant binding, and
confirmation mode agree.

Direct MCP mutations need an explicit safety classification. Unclassified
mutations cannot be projected to MCP except through operations.

```ts
mcp.tool.mutation({
  name: 'create-project',
  ref: api.features.projects.create,
  schema: createProjectArgs,
  permission: projectCreateKey,
  safety: {
    kind: 'bounded-write',
    reason: 'Creates one draft project record named in args.',
  },
})
```

Initial safety vocabulary:

- `read`: no write or external side effect;
- `bounded-write`: bounded write to records named in args;
- `sensitive-write`: invites, tokens, billing, public state, or security impact;
- `destructive-write`: delete, archive, revoke, publish, bulk, irreversible, or
  hard-to-reverse mutation;
- `external-side-effect`: email, webhook, third-party API, indexing, billing, or
  other non-Convex side effect.

`mcp.tool.mutation(...)` accepts only `bounded-write`. Sensitive, destructive,
bulk, publish-like, revoke-like, audited, and external-side-effect work uses
`mcp.tool.operation(...)`. Doctor should warn when names, metadata, or affected
tables look inconsistent with the declared safety class.

The tool-side classification is not the source of truth by itself. The
referenced backend handler, shared descriptor, or generated Trellis function
metadata must also declare a compatible safety class. MCP binding may confirm or
narrow safety; it must not down-classify a dangerous backend ref as
`bounded-write`.

### 5. Destructive MCP Annotations Match Reality

Current issue:

Operation-backed destructive tools go through Trellis destructive handling, but
the internal call can still pass `destructive: false` into lower-level tool
definition to avoid generic destructive rejection.

Next-major decision:

Separate two concepts:

- generic destructive tools are forbidden;
- operation-backed destructive tools must advertise destructive MCP metadata.

The public tool metadata for a destructive operation must include destructive
annotations, even though the unsafe generic destructive path remains blocked.

MCP annotations are client hints, not a security boundary. Backend
authorization, tenant isolation, and confirmation checks remain authoritative.

### 6. Explicit Tenant Binding For MCP Confirmations

Current issue:

The default confirmation tenant key is derived from `principal.tenantId`. In
real workspace apps, tenant can come from actor resolution, delegation, selected
workspace, capability context, or operation args.

Next-major decision:

`defineMcpRuntime` requires an explicit `tenantKey` resolver for workspace MCP:

```ts
defineMcpRuntime({
  principalKey: ({ principal }) => principal.subject,
  tenantKey: ({ actor, capabilities, args }) => actor.workspaceId,
})
```

If no tenant applies, the app must say so:

```ts
tenantKey: () => 'global'
```

No silent fallback for destructive confirmations.

A convenience helper can reduce boilerplate without weakening the rule:

```ts
defineWorkspaceMcpRuntime({
  tenantField: 'workspaceId',
  ...
})
```

The helper still expands to an explicit tenant resolver and should be visible in
`doctor`.

For destructive operations, operation-level tenant binding is stronger than
runtime-level fallback:

```ts
export const deleteProject = destructiveOperation({
  id: 'projects.delete',
  tenant: ({ loaded }) => loaded.project.workspaceId,
  ...
})
```

The confirmation tenant key should come from loaded/previewed data whenever the
target record determines tenant scope. If runtime tenant, operation tenant, and
loaded tenant disagree, execution fails closed and emits a drift observation.
For destructive operations, final confirmation tenant binding happens after
preview/load, not only during MCP runtime setup.

### 7. Fail Closed On Missing Runtime Identity Wiring

Current issue:

Some runtime paths can return anonymous/null principal accessors in production
when wiring is missing. That is too forgiving for a security framework.

Next-major decision:

Missing principal, actor, or trusted-forwarding wiring fails closed unless the
handler is explicitly public.

Production behavior: deny the request.

Development and test behavior: throw a clear actionable error naming the missing
wiring and the handler/tool that needed it. This is still fail-closed; it is
just friendlier to debug.

Public-access paths use an explicit guard such as `publicAccess`, `open`, or a
`query.public(...)` builder. They do not become public because identity wiring
is missing.

### 8. Remove Arity-Based Authorization Inference

Current issue:

`authorize` shorthand can infer meaning from `function.length`. That is fragile
for wrapped functions, defaults, rest params, and minification.

Next-major decision:

Keep simple shorthands only when unambiguous:

```ts
authorize: canEditProject
```

For loaded-record checks, prefer object form:

```ts
authorize: {
  label: 'project.update',
  check: (actor, loaded, args, ctx) => ...
}
```

If a factory form is still useful, name it explicitly:

```ts
authorize: fromLoaded((loaded) => canEditProject(loaded.project))
```

### 9. Reduce Declaration-Merging Registries

Current issue:

Declaration-merged registries make types depend on generated files and module
augmentation state. This can produce cryptic `never` errors when codegen has
not run.

Next-major decision:

Use explicit registry values where possible:

```ts
export const appInventory = defineAppInventory({
  features: [projectsFeature, membersFeature],
})
```

Generated types may still exist, but app source should not become unusable
before generation. If declaration merging remains, it must be hidden behind
generated `.d.ts` and covered by a dedicated "codegen not run" diagnostic.

### 10. Observability Moves To A Narrow Boundary

Current issue:

Trellis owns semantic observability, which is correct, but delivery details add
surface to core. The current code also makes observability feel like a full
runtime system app developers need to understand early.

Next-major decision:

Core owns event vocabulary and event emission points. Delivery lives in
`@lupinum/trellis-observability`.

Core API:

```ts
observe(event)
```

Event schema remains framework-owned. Apps cannot redefine event names, reason
codes, redaction rules, or identity semantics.

Delivery package:

```ts
import { evlogObservability } from '@lupinum/trellis-observability/evlog'
```

Evaluate a constrained sink adapter:

```ts
observability: {
  sink: evlogObservability(),
}
```

The sink contract is deliberately narrow:

```ts
type ObservationSink = {
  emit(event: RedactedTrellisObservationEvent): void | Promise<void>
}
```

The sink receives already-normalized, already-redacted events. It can choose
delivery destination. It cannot change schema, redaction, correlation, identity
semantics, sampling, or request behavior. Trellis-owned config controls
enablement and sampling before the sink. Sink failure is always fail-open.
Sinks must be bounded: slow, unavailable, or backpressured delivery must not
delay user requests beyond a small configured timeout.

Test capture remains available through `@lupinum/trellis/testing` so framework
and app tests can assert emitted events without installing an evlog delivery
package.

### 11. ESLint Leaves Core

Current issue:

Lint rules are useful, but they should not make the runtime package feel like a
full tooling platform.

Next-major decision:

Move rules to `@lupinum/trellis-eslint`.

Default severities:

- security boundary rules: error;
- boundary/style rules: warn;
- experimental rules: off.

Consumers opt into strict mode:

```js
import trellis from '@lupinum/trellis-eslint'

export default [
  trellis.configs.recommended,
  trellis.configs.strictWorkspace,
  trellis.configs.strictMcp,
]
```

### 12. Templates Become Tested Fixture Apps

Current issue:

Many `.tpl` templates are hard to reason about and can drift from examples and
runtime behavior.

Next-major decision:

Starters are generated from real fixture apps.

```text
fixtures/
  public/
  personal/
  workspace/
  workspace-mcp/
  bridge-consumer/
```

Each fixture app:

- builds;
- typechecks;
- runs a minimal test suite;
- passes `doctor`;
- has generated snapshots for CLI output;
- is the source for starter generation.

Each fixture should also have a starter manifest that controls which files are
copied, excluded, and transformed. Fixture-only test files, `.env.local`,
coverage, and package-local artifacts must not leak into generated apps.

String templates are allowed only for tiny generated fragments where a fixture
file would be worse.

### 13. Add `trellis upgrade`

Generated code rots without an upgrade path.

Next-major CLI:

```bash
trellis upgrade
trellis upgrade --from 0.4 --to 1.0
trellis upgrade --check
trellis upgrade --write
```

Each breaking release ships codemods.

Codemods must be:

- idempotent;
- test-backed on fixture apps;
- conservative;
- explicit about files they cannot update safely.

### 14. Add `trellis explain`

Trellis already knows a lot about the app. Expose that as a developer tool.

Examples:

```bash
trellis explain operation projects.delete
```

For 1.0, only `trellis explain operation <id>` ships. Broader scopes
(`explain feature`, `explain mcp`, `explain file`) are deferred to a
future version. They will read the same versioned inventory rather than
introducing a second analyzer.

Desired output:

```text
Operation projects.delete
  kind: destructive
  guard: projectDelete
  load: project + task count
  authorize: project.delete
  tenant: workspaceId from loaded project
  preview: convex/features/projects/operations.previewDelete
  execute: convex/features/projects/operations.delete
  MCP tool: delete-project
  confirmation: required
```

This helps humans and agents debug the framework without reading internals.

`explain` must use structured inventory first: feature manifests, operation
descriptors, operation metadata, MCP tool metadata, and generated API metadata.
AST/source analysis is allowed only as a supplemental diagnostic, not as the
source of truth for security claims.

### 15. Make Doctor An Adoption Dashboard

`trellis doctor` should not only report failures. It should explain what
Trellis thinks the app is.

CLI:

```bash
trellis doctor
trellis doctor --security
trellis doctor --mcp
trellis doctor --tenant
trellis doctor --adoption
trellis doctor --json
trellis doctor --fix
```

Normal output:

```text
Detected app
  layers: Core, Auth, Workspace, MCP
  starter lineage: workspace-mcp
  features: projects, members, documents
  tenant key: workspaceId
  MCP tools: 7 total, 2 destructive
  unsafe permits: 2

Findings
  error   destructive MCP tool archive-project is missing operation binding
  warn    documents table has workspaceId but no by_workspace index
```

`--fix` handles only safe mechanical changes.

`doctor --fix` must never silently change authorization, tenant
classification, forwarding identity behavior, destructive operation binding, or
MCP safety classification. For those, it may generate an audit report or
suggested patch, never an automatic rewrite.

Doctor should be built from two reusable engines:

- inventory engine: what Trellis thinks the app is;
- finding engine: what is wrong, risky, stale, or unsupported.

`doctor`, `explain`, `upgrade --check`, docs generation, and public-surface
checks should reuse the same inventory engine instead of each scanning the repo
differently.

Every machine-readable output from `doctor`, `explain`, and `upgrade --check`
uses a versioned JSON schema:

```json
{
  "schemaVersion": 1,
  "layers": [],
  "features": [],
  "operations": [],
  "tools": [],
  "findings": []
}
```

Inventory and finding JSON must be safe to attach to bug reports. It must not
contain secrets, raw forwarding envelopes, bearer tokens, raw
principal/delegation payloads, request headers, or unredacted user-authored
data.

## Operations-First Model

Handlers remain useful for simple backend code. Operations become the canonical
unit for work that crosses surfaces.

Use operations when work is:

- exposed to MCP;
- called from both UI and server;
- destructive;
- audited;
- packaged through bridge;
- expected to need preview;
- reused by Studio and agent paths.

Operation definition:

```ts
export const publishEntry = operation({
  id: 'cms.entries.publish',
  kind: 'destructive',
  args: publishEntryArgs,
  guard: publishEntryPermission,
  load: {
    label: 'entry + publish readiness',
    run: async (ctx, args) => ({
      entry: await loadEntry(ctx, args.entryId),
      readiness: await computePublishReadiness(ctx, args),
    }),
  },
  tenant: ({ loaded }) => loaded.entry.siteId,
  authorize: {
    label: 'cms.entries.publish',
    check: (actor, { entry }) => actor.cmsId === entry.cmsId,
  },
  preview: ({ entry, readiness }) => ({
    display: {
      summary: `Publish "${entry.title}"`,
      affects: readiness.affectedRoutes,
      blocked: readiness.blocked,
    },
    confirm: {
      entryId: entry._id,
      draftVersion: entry.draftVersion,
      draftHash: entry.draftHash,
      routeDiffHash: readiness.routeDiffHash,
    },
  }),
  execute: async (ctx, args, loaded, confirmation) => {
    assertDraftStillMatches(loaded.entry, confirmation.confirm)
    return await publishLoadedEntry(ctx, loaded.entry, args.locales)
  },
})
```

Projection:

```ts
export const previewPublishEntry = query(publishEntry.preview)
export const executePublishEntry = mutation(publishEntry.execute)
export const publishEntryTool = mcp.tool.operation(publishEntryDescriptor, {
  preview: api.features.entries.operations.previewPublishEntry,
  execute: api.features.entries.operations.executePublishEntry,
})
```

The operation descriptor plus checked projections are the cross-surface source
of truth. The implementation owns backend behavior. The projections may be
derived automatically, or they may be explicit checked bindings when Convex
codegen boundaries require it.

Operation metadata should be structured enough for `doctor` and `explain` to
work from inventory first. Labels for load, authorize, tenant, preview, and
execute are preferred to brittle source inference.

Operation ownership chain:

```text
operation descriptors describe operations
feature manifests include operations
app inventory composes features
doctor, explain, MCP, docs, and upgrade read app inventory first
```

Concrete app inventory shape:

```ts
export const appInventory = defineAppInventory({
  features: [projectsFeature, membersFeature],
})
```

The shared inventory engine reads `appInventory` first. Static source analysis
is only a supplement for diagnostics and drift detection.

## MCP Runtime Spec

### Runtime Setup

Desired app setup:

```ts
export const mcp = defineMcpRuntime({
  resolvePrincipal: async (event) => await resolveMcpPrincipal(event),
  resolveActor: async ({ principal, convex }) => await convex.query(internal.auth.resolveActor, {}),
  resolveCapabilities: async ({ actor, convex }) =>
    await convex.query(internal.permissions.context, {}),
  principalKey: ({ principal }) => principal.subject,
  tenantKey: ({ actor }) => actor.workspaceId,
  callConvex: trustedConvexCaller(),
})
```

The generated workspace MCP starter must prove this flow:

```text
MCP bearer token
  -> token lookup
  -> principal
  -> signed forwarding envelope
  -> Convex actor resolution
  -> backend permission context
  -> capability-aware tool discovery
  -> protected handler execution
```

MCP discovery is advisory. Backend execution is authoritative. If discovery
allows a tool and backend authorization later denies execution, Trellis emits a
capability/backend drift observation and returns the backend denial.

### Tool Types

```ts
mcp.tool.query({
  name: 'list-projects',
  ref: api.features.projects.list,
  schema: listProjectsArgs,
  permission: projectReadKey,
})

mcp.tool.mutation({
  name: 'create-project',
  ref: api.features.projects.create,
  schema: createProjectArgs,
  permission: projectCreateKey,
  safety: {
    kind: 'bounded-write',
    reason: 'Creates one project record named by args.',
  },
})

mcp.tool.operation(deleteProjectDescriptor, {
  name: 'delete-project',
  permission: projectDeleteKey,
  preview: api.features.projects.operations.previewDeleteProject,
  execute: api.features.projects.operations.executeDeleteProject,
})
```

`mcp.tool.mutation(...)` is only for direct bounded writes. Anything
destructive, publish-like, revoke-like, bulk-mutating, external-side-effect, or
audited uses `mcp.tool.operation(...)`.

Direct `mcp.tool.query(...)`, `mcp.tool.mutation(...)`, and any future direct
action projection must point at Trellis public/protected backend handlers with
their own backend policy. MCP capability visibility is not policy. Doctor must
warn when a direct tool points at a raw Convex handler that has no Trellis
metadata, unless it is explicitly public and read-only.

Direct MCP refs must carry generated Trellis function metadata produced by
public/protected backend builders. Raw Convex refs without Trellis metadata are
rejected unless explicitly declared public and read-only. MCP tools are
allowlisted through explicit declarations or generated inventory; Trellis does
not expose Convex refs by directory convention alone.

### Actions

Convex actions are allowed, but they are easy to misuse because they usually
touch external systems.

Default rule:

- external-side-effect, audited, sensitive, or destructive action work should be
  modeled as an operation;
- a future `mcp.tool.action(...)` may exist only for read-only or diagnostic
  actions;
- generic custom tools must not become the action escape hatch for protected app
  writes.

Business-impacting external side effects should use operations:

```ts
mcp.tool.operation(syncLinearIssueDescriptor, {
  preview: api.features.integrations.operations.previewSyncLinearIssue,
  execute: api.features.integrations.operations.executeSyncLinearIssue,
})
```

Candidate direct action shape for diagnostics:

```ts
mcp.tool.action({
  name: 'check-linear-status',
  ref: api.features.integrations.checkLinearStatus,
  schema: checkLinearStatusArgs,
  permission: integrationReadKey,
  safety: {
    kind: 'read',
    reason: 'Reads integration health only; no external mutation.',
  },
})
```

That direct action shape requires an API spike.

### Generic Tools

Generic tools are advanced.

They are allowed for:

- external service calls after backend policy is checked;
- diagnostics;
- public read-only data not backed by Convex;
- transport-specific protocol work.

They are not allowed for:

- destructive app mutations;
- direct tenant-scoped business writes;
- bypassing protected handlers;
- direct protected Convex mutations/actions unless they go through a Trellis
  protected backend ref projection or operation;
- identity forwarding through public args.

### Result Envelope

Keep explicit result envelopes:

```ts
return ctx.ok(data, 'Created project.')
return ctx.error('auth', 'You do not have permission to create projects.')
return ctx.preview({ summary })
return ctx.blocked({ summary, reasons })
```

Untrusted user-authored text must be marked:

```ts
withUntrustedText(entry.bodyMdc)
```

## Component Bridge Spec

### Purpose

The bridge exists for packaged integrations, not app-local architecture.

Use it when a package needs to:

- install host-owned Convex files;
- expose stable root refs;
- hide internal component refs;
- forward a verified principal into component functions;
- drift-check generated host files;
- manage host setup edits.

Do not use it when app-local code can call root handlers directly.

### Package API

```ts
import { createComponentBridge } from '@lupinum/trellis-bridge/convex'

export const component = createComponentBridge({
  query,
  mutation,
  action,
  internalQuery,
  internalMutation,
  internalAction,
})
```

```ts
import { defineBridgeManifest } from '@lupinum/trellis-bridge/manifest'

export default defineBridgeManifest({
  packageName: '@lupinum/ginko-cms',
  version,
  modules: [...],
  managedEdits: [...],
})
```

### Bridge Invariants

- Bridge files are generated, thin, and host-owned.
- Bridge manifests do not contain business logic.
- Bridge functions forward identity through the signed forwarding envelope.
- Component guards, actor resolution, and authorization still run.
- Direct internal component refs remain private.
- Drift is checkable.
- Package authors own product-specific setup commands.

### Ginko CMS Alignment

Ginko CMS should keep:

- `@lupinum/ginko-cms` as the Nuxt module and public product package;
- `@lupinum/ginko-cms-contract` as framework-neutral contracts;
- `@lupinum/ginko-cms-convex` as the Convex component;
- Ginko-owned CLI and docs;
- generated host bridge files;
- `ginko-cms bridge check`.

Ginko should change:

- import bridge primitives from `@lupinum/trellis-bridge`;
- stop depending on bridge APIs from `@lupinum/trellis/functions`;
- shrink bridge exports to one command per real backend concern;
- move all destructive Studio and MCP workflows onto real operations;
- delete pseudo-operation wrappers as each real operation lands.

Ginko's rule for destructive CMS work:

```text
Studio preview and MCP preview are the same backend operation preview.
Studio execution and MCP execution are projections of the same operation.
```

Ginko is the reference bridge consumer, not a Trellis release hostage. Trellis
keeps a small Ginko-shaped bridge fixture in-tree to prove bridge behavior.
Full Ginko CMS package E2E stays in the Ginko CMS repo and runs against packed
Trellis packages during coordinated releases.

The bridge API should be honest about maturity: it is for packaged integrations
and is currently pressure-tested by Ginko CMS. It should not be marketed as a
broad plugin API.

## Starter Strategy

Official starters:

```text
public
personal
workspace
workspace-mcp
```

MCP can remain "workspace + capability" internally, but the CLI may expose
`workspace-mcp` as a clearer generated target.

`cms` is intentionally not listed as mandatory until the Ginko ownership
decision is settled.

### Public Starter

Includes:

- one public feature;
- live query;
- mutation;
- no auth;
- no tenant;
- no MCP;
- no bridge.

### Personal Starter

Includes:

- auth;
- user principal;
- personal actor;
- owner-scoped records;
- one authorization test.

### Workspace Starter

Includes:

- auth;
- workspace membership;
- roles;
- permissions;
- tenant-scoped table;
- `_can` projection;
- one server route;
- tenant tests.

### Workspace MCP Starter

Includes everything in Workspace plus:

- MCP token/key flow;
- principal resolution;
- actor/capability resolution;
- one read tool;
- one write tool;
- one destructive operation tool;
- confirmation store;
- rate limiting;
- e2e or integration test proving tool execution.

### CMS Starter

The CMS path needs a separate product decision.

If it means "install Ginko CMS into a Trellis app", it should probably be
Ginko-owned setup or a Ginko consumer fixture, not a beginner-facing Trellis
starter.

If it means "build a packaged Convex component like Ginko", it should be an
advanced bridge-author example, not a normal starter.

Until that decision is made, `cms` is a maintained reference/fixture candidate,
not a required next-major starter.

## CLI Spec

Canonical commands:

```bash
trellis init <name> --starter public
trellis init <name> --starter personal
trellis init <name> --starter workspace
trellis init <name> --starter workspace-mcp
# optional, only if the CMS/Ginko ownership decision keeps a Trellis-owned fixture:
trellis init <name> --starter bridge-consumer

trellis add auth
trellis add workspace
trellis add mcp
trellis add feature projects
trellis add entity project
trellis add operation delete-project --kind destructive
trellis add uploads

trellis doctor
trellis explain
trellis upgrade
```

Advanced:

```bash
trellis bridge ...
```

Only if the bridge package is installed, or as a delegating alias to
`trellis-bridge`.

## Testing Spec

The pipeline is the product. Tests must exercise the pipeline, not only leaf
helpers.

### Required Contract Tests

Core:

- live query state;
- server caller auth modes;
- uploads;
- config validation.

Auth:

- missing runtime identity fails closed;
- signed-in principal does not imply actor;
- actor resolution is app-owned;
- forged forwarded identity fails.

Workspace:

- viewer/member/admin role checks;
- cross-tenant read denial;
- tenant escape requires typed permit;
- `_can` projection matches backend policy in representative cases.

MCP:

- token -> principal -> actor -> permission -> tool execution;
- capability hidden means tool unavailable;
- backend denial still blocks visible tool;
- destructive operation requires preview;
- confirmation replay fails;
- confirmation drift fails;
- wrong tenant key fails;
- missing distributed rate-limit store fails production checks.

Bridge:

- generated bridge forwards signed envelope;
- query, mutation, action, internal variants work;
- generated files drift-check;
- Ginko fixture passes bridge check.

### Starter Tests

Every starter fixture must:

- install;
- build;
- typecheck;
- run minimal tests;
- pass `trellis doctor`;
- avoid advanced layers it did not enable.

### Ginko CMS Reference Tests

The Trellis repo should include a bridge consumer fixture derived from Ginko CMS
or a narrow Ginko-like test package. The Ginko CMS repo should continue to run
full package E2E against packed Trellis packages.

Acceptance:

- Ginko can expose bridged actions.
- Ginko can bind destructive MCP tools through real operations.
- Ginko users run Ginko commands, not Trellis internals.

## Documentation Spec

Docs must use progressive disclosure.

### Front Door

1. What is Trellis?
2. Should you use Trellis?
3. Build a public app in 10 minutes.
4. Add auth.
5. Add a workspace.
6. Add MCP safely.
7. Add a destructive operation.
8. Debug with doctor.

### Decision Docs

Add pages for wrong-but-tempting paths:

- Why not put `principal` in args?
- Why MCP tools should not duplicate Convex handlers.
- Why `usePermissions()` is not authorization.
- Why tenant isolation is not business policy.
- Why destructive MCP tools need preview.
- Why generic MCP tools are advanced.
- Why component bridge is only for packaged integrations.

### API Docs

API docs should group by job:

- app/client;
- backend;
- auth;
- workspace;
- server;
- MCP;
- testing;
- bridge package authors.

Do not lead with a complete export inventory.

## Security Spec

### Threat Model

Trellis next major explicitly defends against:

- forged forwarded principals;
- raw public args smuggling identity;
- exposed forwarding shared secrets;
- stale or replayed destructive confirmations;
- stale preview execution after args, version, or tenant drift;
- cross-tenant MCP tool invocation;
- MCP tool duplication bypassing backend authorization;
- visible MCP tools whose backend authorization later denies execution;
- generated bridge drift;
- process-local production confirmation/rate-limit state loss;
- user-authored text treated as trusted model-facing output.

Trellis does not fully solve:

- compromised server runtime;
- malicious package authors;
- app-defined permission logic bugs;
- weak app actor resolvers;
- business quota abuse unless the app implements quotas;
- MCP clients ignoring annotations;
- secrets included by the app inside custom principal payloads.

### Production Safety Defaults

Production must fail closed for:

- missing trusted forwarding signing keys;
- weak forwarding keys;
- expired forwarding envelope;
- missing principal accessor on protected handlers;
- destructive MCP tool without operation binding;
- process-local confirmation store for production destructive MCP;
- process-local rate limiter for production MCP when rate limiting is enabled;
- public runtime config exposing secrets.

Production mode must be explicit and inspectable:

```ts
trellis: {
  security: {
    mode: 'development' | 'preview' | 'production',
  },
}
```

Trellis may infer the default from environment, but `doctor` must print the
resolved mode and the source of inference. Preview deployments that handle real
data should be able to opt into production safety.

Mode behavior:

```text
development  memory stores allowed; loud warnings and actionable throws
preview      production-like warnings; configurable strict failures
production   fail closed at security boundaries
```

If a deployment environment looks public but resolves to `development`,
`doctor --security` should warn.

MCP production policy:

- development may use memory-backed stores;
- production MCP requires supported distributed stores or an explicit
  documented opt-out for read-only tools;
- destructive MCP cannot opt out of distributed confirmation/replay state;
- custom stores are allowed only if they expose a self-test that `doctor --mcp`
  can run.

First-party production defaults must exist before 1.0 final:

- Convex-backed confirmation/replay store for destructive operation execution;
- Redis or supported Nitro storage backed rate limiter for MCP ingress.

Custom stores may exist, but doctor should mark them unverified unless their
self-test covers atomic redeem, expiry, concurrent use, clock-skew behavior,
idempotency behavior, and failure-mode behavior.

### Unsafe Permits

Replace string-only bypass reasons with typed permits.

```ts
unsafe.mutation({
  permit: unsafe.permit({
    kind: 'preTenantUpload',
    reason: 'Generate upload URL before an asset record exists.',
    scope: ['assets'],
    reviewBy: '2026-07-01',
  }),
  ...
})
```

The same typed permit mechanism is used for backend unsafe handlers, tenant
escapes, and advanced MCP custom tools. Do not introduce separate
`unsafe.reason` shapes per surface.

Doctor groups and audits permits:

```text
Unsafe permits
  preTenantUpload      1
  operatorSupportView  2
  uncategorized        0
```

Default mode:

- `kind`, `reason`, and `scope` are required;
- `reviewBy` is optional but recommended.

Strict/security mode:

- `reviewBy` is required;
- expired `reviewBy` fails;
- uncategorized permits fail.

Apps may define allowed permit kinds so `kind` does not become string soup:

```ts
export const unsafePermitKinds = defineUnsafePermitKinds({
  preTenantUpload: { defaultScope: ['assets'] },
  operatorSupportView: { requiresReviewBy: true },
  externalService: { requiresScope: true },
})
```

Unknown kinds warn by default and fail in strict/security mode.

### Confirmation Binding

Destructive confirmation tokens bind:

- operation id;
- execute ref;
- preview ref;
- principal key;
- tenant key;
- args hash;
- preview confirm hash;
- version hash;
- expiry;
- replay id.

Backend execution must validate confirmation when `confirmationMode: backend`
is used.

Transport confirmation may exist only when the backend operation boundary still
receives enough proof to reject missing or stale confirmation.

### Runtime Failure Policy

| Surface                  | Failure                                            | Policy                                                         |
| ------------------------ | -------------------------------------------------- | -------------------------------------------------------------- |
| Protected handler        | missing principal accessor                         | deny in production; actionable throw in dev/test               |
| Protected handler        | missing actor when guard requires actor            | deny in production; actionable throw in dev/test               |
| Public handler           | no identity wiring                                 | allowed only with explicit public-access guard                 |
| Trusted forwarding       | invalid, expired, replayed, or mismatched envelope | hard deny                                                      |
| MCP discovery            | capability resolution fails                        | hide protected tools and emit observation                      |
| MCP execution            | backend denies after discovery allowed tool        | backend denial wins; emit capability/backend drift observation |
| Destructive confirmation | confirmation store unavailable                     | hard deny                                                      |
| Rate limiting            | limiter unavailable for protected/destructive MCP  | hard deny unless explicit read-only opt-out applies            |
| Observability delivery   | sink throws or times out                           | fail open; never changes request behavior                      |
| Doctor                   | finding fails strict policy                        | non-zero exit                                                  |

Actor resolution detail:

- missing actor resolver wiring is setup failure for protected handlers that
  can access actor-required guards or permissions;
- a resolved `null` actor is allowed only when the guard/permission is
  explicitly anonymous-capable;
- actor-required guards and permissions should carry metadata so Trellis can
  distinguish missing wiring from a normal denied anonymous actor.

## Public Surface Budget

Next major should have a public surface budget. Every public export needs one of
these labels:

- core;
- auth;
- workspace;
- mcp;
- server;
- testing;
- package-author;
- internal.

The budget covers more than npm exports:

- npm package exports;
- Nuxt aliases;
- Nuxt auto-imports;
- generated aliases;
- global components;
- CLI commands;
- generated file contracts;
- bridge manifest contracts;
- public docs snippets.

Public export acceptance:

1. Is this needed by consumer app code?
2. Is this needed by package authors such as Ginko CMS?
3. Can it be generated instead?
4. Can it be private and surfaced through `doctor` or `explain`?
5. Does it create a second source of truth?

If the answer is weak, do not export it.

Add a CI command:

```bash
pnpm run check:public-api
trellis check-public-api
```

It snapshots package exports, aliases, auto-imports, CLI commands, and generated
contracts. CI fails when public surface changes without an explicit accepted
diff.

Public surface diffs require at least one of:

- accepted ADR/spec update;
- migration note;
- test update;
- docs update.

## Runtime And Build Budget

The calmer surface must not hide heavier runtime costs.

- Public/Core apps must not load MCP, bridge, ESLint, or observability delivery
  code at runtime.
- App startup must not run doctor/explain analysis.
- Doctor, explain, upgrade, and fixture generation may do heavier static
  analysis.
- MCP runtime should cache per-request principal, actor, capability, and runtime
  state instead of repeating Convex calls unnecessarily.
- Signed forwarding should use local key material and avoid per-call remote key
  lookups.
- Phase 0 should add a benchmark target for forwarding envelope verification.
  Initial target: under 1ms p99 per verification in the local benchmark fixture
  before network or Convex execution time. If the security RFC chooses an
  algorithm that exceeds this, the RFC must justify the tradeoff and set a
  measured budget. CI should fail on significant regressions after the baseline
  is accepted, not on the first absolute target before implementation tradeoffs
  are known.
- Fixture generation may be slower than string templates, but generated apps
  must be simpler to inspect and validate.

## Migration Strategy

This is a major release. Prefer deletion over compatibility.

Every removed public path needs:

- a documented replacement;
- a codemod when mechanical;
- an `upgrade --check` diagnostic when not mechanical;
- a before/after fixture;
- a release note explaining why the old path was removed.

Authorization migrations, especially removal of arity-based `authorize`
inference, must default to audit reports unless the codemod can prove the
rewrite is safe. Silent authorization rewrites are not acceptable.

### Initial Migration Table

| Old path or pattern          | New path or pattern                        | Migration                         |
| ---------------------------- | ------------------------------------------ | --------------------------------- |
| `@lupinum/trellis/bridge`    | `@lupinum/trellis-bridge`                  | codemod                           |
| `@lupinum/trellis/functions` | `@lupinum/trellis/backend`                 | codemod                           |
| `tool.fromOperation(...)`    | `mcp.tool.operation(...)`                  | codemod                           |
| raw trusted forwarding args  | `_trellisForwarding` signed envelope       | codemod plus manual audit         |
| `unsafe.*({ bypass })`       | `unsafe.*({ permit: unsafe.permit(...) })` | codemod when shape is obvious     |
| arity-inferred `authorize`   | explicit `authorize` object or helper      | audit report unless provably safe |
| `workspace --mcp`            | `workspace-mcp`                            | CLI migration                     |

This table is intentionally narrow. It exists so public API impact stays visible
without preserving deleted paths as compatibility aliases.

Release gates:

```text
1.0-alpha  fixtures, descriptor boundary, signed forwarding spike, MCP spike
1.0-beta   bridge package boundary, workspace-mcp fixture, doctor security checks
1.0-rc     public surface budget, docs, migration tooling, codemods
1.0        old public paths removed according to the accepted migration table
```

### Phase 0: Fixture And API Spikes

- Create `public`, `personal`, `workspace`, and `workspace-mcp` fixture apps.
- Create a minimal Ginko-shaped bridge consumer fixture.
- Spike operation-first MCP without Convex implementation imports in server
  tool files.
- Spike signed forwarding envelope hashing, TTL, key rotation, and replay.
- Add target API type tests.

No production API changes yet.

Phase 0 exit gate:

- all fixture apps build, typecheck, run minimal tests, and pass doctor;
- each risky experiment has a written go/no-go note;
- CMS/Ginko ownership for `cms` versus `bridge-consumer` is decided before
  Phase 0 sign-off.

### Phase 1: Commit Fixture-Based Starters

- Convert starter generation for `public`, `personal`, `workspace`, and
  `workspace-mcp` to fixture sources.
- Make fixtures build, typecheck, test, and pass doctor.
- Add starter snapshots.

Acceptance:

- a fresh user can build public and workspace apps without seeing MCP/bridge;
- `workspace-mcp` proves read, write, destructive preview, confirmation, replay
  failure, and drift failure.

### Phase 2: Establish Bridge Package Boundary

- Create `@lupinum/trellis-bridge`.
- Move bridge code mechanically enough that forwarding work targets the real
  package boundary.
- Keep product migration small: Ginko can continue to validate through the
  Ginko-shaped fixture while signed forwarding is still being finalized.

Acceptance:

- Trellis core no longer needs bridge imports for normal app runtime tests;
- bridge package can run fixture drift checks;
- no new bridge public API is stabilized beyond the minimal package boundary
  required for forwarding and fixtures.

### Phase 3: Harden Trusted Forwarding

- Implement signed forwarding envelope.
- Update server callers.
- Update MCP runtime.
- Update bridge runtime fixture.
- Delete raw shared-key forwarding args.

Acceptance:

- `rg "principal:"` in generated transport args finds no identity forwarding
  except in envelope construction tests.
- forged principal args fail.
- stale envelope fails.
- wrong function ref fails.
- wrong args hash fails.
- unknown `kid`, wrong audience, and replayed destructive execution fail.

### Phase 4: Operation-First MCP

- Add `mcp.tool.query`, `mcp.tool.mutation`, `mcp.tool.operation`.
- Mark generic custom tools advanced.
- Fix destructive MCP annotations.
- Add explicit runtime and operation-level tenant binding.
- Update examples and Ginko-shaped fixture destructive tools.
- Delete old `tool.fromOperation` public path and ship a mechanical codemod to
  `mcp.tool.operation(...)`.

Acceptance:

- no destructive MCP tool uses generic custom tool;
- operation descriptors can be imported safely by MCP server files;
- workspace MCP starter has e2e coverage;
- codegen-not-run cases fail with a clear diagnostic.

### Phase 5: Complete Bridge Extraction

- Move bridge runtime, manifest, drift checks, and CLI.
- Update the Ginko-shaped fixture to consume the new package.
- Coordinate Ginko CMS repo migration against packed Trellis packages.
- Delete bridge exports from core.
- Add a migration codemod for imports.

Acceptance:

- Trellis core has no bridge public export.
- Ginko-shaped fixture passes in Trellis.
- Ginko package E2E passes in the Ginko repo for coordinated release.
- Existing mini CMS example is updated or moved to bridge examples.

### Phase 6: Public Surface Cleanup

- Remove declaration-merging registries where explicit inventory works.
- Simplify exports.
- Move ESLint and observability delivery out of core.
- Add public-surface CI budgets.
- Update docs to job-based imports.

Acceptance:

- public export count decreases;
- "most people need these imports" docs fit on one page;
- type errors for missing codegen have explicit diagnostics.

### Phase 7: CLI And Docs

- Add `trellis upgrade`.
- Add `trellis explain`.
- Rewrite front-door docs.
- Expand doctor dashboard.

Acceptance:

- fresh user can build public app, workspace app, and workspace MCP app from
  docs without reading ADRs;
- doctor explains app shape;
- upgrade codemods run on old fixtures.

## Experiments Before Committing

### Experiment 1: Bridge Extraction With Ginko-Shaped Fixture

Question:

Can bridge leave core without making packaged integrations worse?

Build:

- new `@lupinum/trellis-bridge` package;
- update a minimal Ginko-shaped fixture;
- validate full Ginko CMS separately in the Ginko repo against packed packages.

Success:

- Ginko-shaped fixture passes in Trellis;
- Ginko package E2E passes in Ginko's repo during coordinated release;
- Trellis core no longer exports bridge APIs;
- Ginko docs remain Ginko-first.

### Experiment 2: Signed Forwarding Envelope

Question:

Can signed envelopes replace raw forwarding args without too much ceremony?

Build:

- envelope signer and verifier;
- server caller integration;
- MCP caller integration;
- bridge integration;
- Ginko generated bridge update.

Success:

- no raw shared secret travels as a Convex arg;
- no public principal/delegation args are required;
- tests cover expiry, function mismatch, args mismatch, subject mismatch,
  audience mismatch, unknown key id, and replay.

### Experiment 3: Operation-First MCP API

Question:

Can destructive MCP authoring become one obvious line?

Build:

```ts
mcp.tool.operation(publishEntryDescriptor, {
  preview: api.features.entries.operations.previewPublishEntry,
  execute: api.features.entries.operations.executePublishEntry,
})
```

Success:

- preview and execute refs derive from operation metadata or are explicitly
  declared through thin checked bindings;
- destructive annotations are correct;
- backend confirmation remains enforced;
- Nitro/server tool files do not import Convex implementation code;
- codegen-not-run cases fail clearly;
- Ginko publish tool becomes thinner.

Best-case future syntax:

```ts
mcp.tool.operation(entries.publish)
```

where `entries.publish` is a shared descriptor or generated operation handle.
It must not require Nitro/server tool files to import Convex implementation
modules.

### Experiment 4: Fixture-Based Starters

Question:

Can starter generation stop relying on many string templates?

Build:

- convert `public`, `personal`, `workspace`, and `workspace-mcp`;
- snapshot generated output;
- add upgrade codemod harness.

Success:

- fixture apps run as real examples;
- generated apps pass doctor;
- CLI code shrinks.

### Experiment 5: Doctor As App Map

Question:

Can doctor explain the app instead of only warning?

Build:

- `doctor --adoption`;
- `doctor --mcp`;
- app inventory summary from composed features.

Success:

- output identifies enabled layers;
- output lists tenant model, features, operations, MCP tools, unsafe permits;
- CI JSON remains stable.

### Experiment 6: Observability Boundary

Question:

Can core own event schema while delivery moves out?

Build:

- core event emitter interface;
- evlog sink package;
- test capture sink.

Success:

- event vocabulary remains stable;
- app cannot redefine identity/redaction semantics;
- core dependency graph gets smaller;
- tests can assert events without replacing production logger.

## Decisions From Review Feedback

Accepted:

- Trellis is a framework, not a small library.
- The protected handler pipeline is the franchise and stays.
- MCP as projection is the differentiator and should be clearer.
- Destructive operation safety is justified.
- Component bridge belongs outside core.
- Generated code needs an upgrade path.
- The first user experience should be calmer.
- Large runtime files should split by responsibility.
- Public imports need pruning and clearer names.
- Workspace MCP identity flow needs a golden-path test.
- Trusted forwarding should be hardened.
- Doctor should become more educational.
- Ginko CMS is a valid bridge use case and should not build a second bridge.
- Auth, Workspace, and MCP are product layers first, not npm packages by
  default.
- Observability sinks are delivery-only and receive already-redacted events.
- Unsafe permits use one typed mechanism across backend and MCP custom tools.

Partially accepted:

- ESLint should move out of core, but security-critical rules can still be
  errors in strict configs.
- Resource DSL should wait until raw operation projection is excellent.
- The dream `mcp.tool.operation(operation)` API is desirable, but descriptors
  and explicit checked bindings are acceptable if Convex codegen requires them.

Rejected:

- Making Trellis stack-neutral.
- Adding a broad plugin system.
- Keeping old and new bridge paths side by side after the major cutover.
- Keeping generic destructive MCP tools as a supported lane.
- Treating Ginko CMS users as Trellis users in public setup docs.

## Maintenance And Version Lifecycle

Trellis 1.0 should set adopter expectations, not only API shape.

- 1.0 should receive bugfix releases for at least 12 months after final
  release.
- The final 0.x line should receive critical security and migration-blocking
  fixes for a short, announced window after 1.0 final.
- Future removals should be deprecated one major in advance when the old path is
  already released and widely used.
- Security-sensitive or unreleased greenfield paths may still use hard cutovers
  when tests and codemods exist.

## Acceptance Criteria For 1.0

The 1.0 release is ready when:

- bridge is removed from core public exports;
- production-safe forwarding replaces raw shared-key and identity args;
- destructive MCP uses operation-backed preview/confirm/execute only;
- `workspace-mcp` proves token -> principal -> actor -> permission -> tool
  execution, plus destructive preview, confirmation, replay failure, and drift
  failure;
- `public`, `personal`, `workspace`, and `workspace-mcp` starters are generated
  from tested fixtures;
- typed unsafe permits cover unsafe handlers, tenant escapes, and generic MCP
  custom tools;
- direct MCP mutations require explicit `bounded-write` classification backed
  by generated Trellis metadata;
- first-party production-safe confirmation/replay and MCP rate-limit store paths
  exist and pass doctor self-tests;
- doctor checks forwarding, tenant boundaries, MCP safety, destructive
  operations, confirmation stores, and rate-limit stores;
- the inventory engine emits versioned JSON used by doctor and upgrade checks;
- public-surface budget runs in CI;
- old bridge imports, old MCP tool patterns, and old forwarding helpers have
  codemods or `upgrade --check` diagnostics;
- the forwarding envelope RFC has named ownership and security-aware review.

`trellis explain operation <id>` is the first `explain` command to ship if the
inventory engine can support it without a second analyzer. Broader `explain`
commands may wait for the full dream version.

## Acceptance Criteria For The Dream Version

The full dream version is ready when:

- A new user can build a public app without seeing workspace, MCP, or bridge
  concepts.
- A new user can build a workspace MCP app and see one read tool, one bounded
  write tool, and one destructive operation tool work end to end.
- A reviewer can answer where trust enters, how actor resolution happens, where
  tenant boundaries are enforced, which permission gates the action, and how MCP
  reuses the backend model.
- Core package exports no bridge APIs.
- Trellis has a Ginko-shaped bridge fixture, and full Ginko CMS E2E passes in
  the Ginko repo for coordinated releases.
- Destructive MCP tools cannot be generic custom tools.
- Operation-backed destructive MCP tools advertise destructive annotations.
- Trusted forwarding no longer passes a raw long-lived shared key as a Convex
  arg.
- Missing protected runtime identity wiring fails closed in production.
- `trellis doctor --mcp` catches destructive tool, confirmation store,
  rate-limit store, tenant key, and capability drift.
- `trellis explain operation <id>` can describe guard, load, authorize, preview,
  execute, tenant, and MCP projection.
- Starter fixtures are tested and used as generation sources.
- `trellis upgrade --check` can identify old bridge imports and old MCP tool
  patterns.

## Open Questions

1. How much of operation projection can be derived without Convex codegen
   ordering problems?
2. Resolved: `workspace-mcp` fully replaces `workspace --mcp`; no 1.0 flag alias
   is kept.
3. Is `cms` a Ginko-owned setup path, an advanced bridge-author fixture, or both
   in separate places? Decide before Phase 0 sign-off.
4. Resolved: the public backend import is `@lupinum/trellis/backend`;
   `@lupinum/trellis/functions` is deleted.
5. Should public-access handlers use `query.public(...)`, `guard: open`, or a
   clearer guard such as `publicAccess`?
6. Resolved: old public paths are hard-deleted unless this spec explicitly lists
   them as retained.

Resolved for 1.0 unless the team explicitly reopens it:

- `tool.fromOperation` is hard-deleted from public API and replaced by
  `mcp.tool.operation(...)` plus a codemod.

## Final Target Shape

The best version of Trellis is not a bigger framework. It is a calmer
framework.

It should feel small at the start:

```text
Nuxt + Convex, clean data calls, one feature folder.
```

It should become strict at trust boundaries:

```text
auth, actor resolution, permissions, tenant isolation.
```

It should become unforgiving at agent write boundaries:

```text
operation preview, signed confirmation, drift check, replay protection.
```

And it should keep packaged integrations behind a clear door:

```text
Use bridge only when you are shipping something like Ginko CMS.
```

That is the dream form: opinionated, safe, inspectable, agent-ready, and small
enough in the developer's head that teams can actually adopt it.
