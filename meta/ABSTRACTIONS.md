# Abstractions

This document defines the Trellis vocabulary maintainers and agents should use when reading or changing the codebase.

## Principal

A principal is the transport-shaped caller identity.

Examples:

- anonymous browser visitor
- signed-in browser user
- verified server caller
- webhook request after route verification
- MCP agent request
- test principal

Principals answer: how did this call arrive?

They do not answer what the caller may do in the app.

## Actor

An actor is the app-shaped identity resolved from a principal.

Examples:

- user
- workspace member
- owner
- admin
- service actor delegated to a user
- anonymous visitor with public-only capability

Actors answer: who is this caller in this app?

Actor resolution is app-owned because roles, memberships, and tenant scopes live in app data.

## Guard

A guard is an early authorization gate. It should answer broad access questions before expensive work or record-specific decisions happen.

Examples:

- caller must be signed in
- caller must have an actor
- caller must belong to a workspace
- caller must be allowed to enter a route or handler family

Guards are not a replacement for record-specific authorization.

## Load

`load` fetches the records needed for a protected handler decision.

Use `load` when the authorization decision depends on app data, such as a task, workspace, membership, article, or operation preview target.

## Authorize

`authorize` makes the record-specific decision after `load`.

Examples:

- actor can update this task
- actor can view this article after visibility rules
- actor can run this destructive operation against the loaded record
- actor can delegate this server action

Keep policy here instead of scattering checks across UI code or handler bodies.

## Handler

The handler performs the work after principal, actor, guard, load, and authorize have succeeded.

Handlers should assume the framework path has already established identity and policy. They still own business correctness and data writes.

## Observe

Observation records decision and transport context without changing business identity.

Observability helps maintainers debug why a call happened, where it came from, and which boundary was crossed. It is emitted around important decisions, not as a guaranteed final handler phase. It must not affect query cache identity or authorization results.

## Permission Projection

Permission projection turns backend-owned authorization truth into frontend-readable capability state.

Examples:

- generated `usePermissions()`
- `useAuthGuard()`
- `_can` fields on resource records
- permission-context queries

Projected permission state helps UI render the right controls. Backend handlers still enforce the real policy.

## Tenant Boundary

A tenant boundary defines which records exist for an actor.

In the common workspace model, `workspaceId` and `by_workspace` indexes form the tenant boundary. More advanced apps may use memberships, active workspace switching, or explicit cross-workspace views.

Cross-tenant access must be explicit, narrow, and justified by the app model.

## Trusted Forwarding

Trusted forwarding is the server-to-Convex identity bridge.

It allows a verified Nitro route, webhook boundary, or MCP server path to call Convex with a forwarded principal. That forwarded principal is valid only after the server path has verified the request and signed the forwarding context.

Never treat raw public args as forwarded identity.

## Destructive Operation

A destructive operation is work that deletes, publishes, revokes, overwrites, bulk-mutates, or otherwise has meaningful irreversible effect.

First-party UI may call guarded destructive handlers directly when the UX owns the context.

Cross-surface and MCP destructive flows should use operation-backed preview and execute entrypoints. The preview explains what will happen; execution checks that the confirmed preview still matches.

## MCP Projection

MCP projection exposes selected app operations to agents.

Trellis treats MCP as a projection of the app backend, not a separate backend. MCP tools should reuse the same principal, actor, guard, permission, tenant, and destructive-operation model as the browser and server paths.

## Feature Folder

A feature folder is the main ownership boundary in generated and maintained Trellis apps.

Typical shape:

```text
shared/features/<feature>/contract.ts
convex/features/<feature>/
app/features/<feature>/
```

The shared contract describes runtime-neutral shape. The Convex feature owns backend behavior. The app feature owns UI behavior. Routes and shell files should stay thin.

## Feature Manifest

A feature manifest is the typed inventory exported by a feature through `defineFeature(...)` and combined through `composeFeatures(...)`.

It carries schema, permissions, tenant-scoped tables, global tables, capabilities, and operations. Trellis uses this inventory to avoid hand-maintained parallel lists and to make tenant classification checkable.

## Component Bridge

A component bridge is the packaged-integration seam for Trellis-aware components.

It lets a package install stable host bridge files and managed host edits while forwarding an explicit principal into component refs. It is not a normal app feature boundary and it does not bypass guards, actor resolution, or app authorization.

## Harness

The internal harness is a maintainer verification app. It proves package behavior, e2e flows, auth, trusted forwarding, and MCP integration in one controlled workspace.

It is not a public example and should not become the source of product docs.

## Labs

Labs are archived or experimental concept material. They pressure future decisions but do not define the current public contract.
