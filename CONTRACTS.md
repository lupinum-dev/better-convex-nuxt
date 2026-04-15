# Trellis Runtime Contracts

This file names the repo's default contracts explicitly so users can see what Trellis is assuming when they adopt the canonical patterns.

## Execution Model

The protected runtime follows one pipeline:

`principal -> actor -> authenticated?/guard enforcement -> load -> authorize -> handler -> projection`

- `principal`: transport-level caller identity
- `authenticated`: built-in pre-actor gate for “signed in, actor not required yet”
- `actor`: app-owned business identity derived from the principal
- `guard`: coarse access decision at the handler boundary
- `load`: fetch resource state needed for the decision
- `authorize`: resource-level check after loading
- `handler`: business logic
- `projection`: browser, Nitro, MCP, or component bridge calling the same protected operation

The runtime resolves both principal and actor eagerly, then chooses the enforcement branch:

- `open`: no enforcement
- `authenticated`: principal must be non-anonymous, actor may still be `null`
- actor guard: actor must resolve and pass the guard

## Canonical Workspace Contract

Examples `03` through `06` use the default single-workspace shape:

- tenant foreign key: `workspaceId`
- tenant index: `by_workspace`
- user lookup field: `users.authId`
- user role field: `users.role`
- user tenant field: `users.workspaceId`
- stable ownership field: `ownerId`
- timestamps: `createdAt` / `updatedAt` in milliseconds

`ownerId` should stay stable when an app grows from personal auth into tenant scoping. Add `workspaceId`; do not rename ownership.

## `tenantIsolation`

`tenantIsolation` is a row-level safety net, not a replacement for business authorization.

What it guarantees:

- tenant-scoped reads and writes are filtered by the configured tenant field
- cross-tenant access fails automatically when actor and document tenant do not match

What it does not guarantee:

- role checks
- resource ownership checks
- special-case reporting or agency views
- onboarding flows before a user has a tenant assignment

Intentional escape hatches should stay explicit in app code.

## `definePermissionContext()`

`definePermissionContext()` is the bridge from backend guards into Nuxt permission state.

It provides:

- a single backend query for the current permission context
- typed `can` values for frontend gating
- optional extra fields such as `role`, `plan`, `usage`, `displayName`

It does not replace handler guards. Frontend permissions are a view of backend truth, not a second authorization system.

## `projectTool()`

`projectTool()` projects an existing protected operation into MCP.

It injects:

- trusted-caller transport plumbing
- principal forwarding
- shared args validation reuse
- the same handler/guard/load/authorize logic used by browser and server callers

It does not create a second business layer. MCP is a transport seam over the same backend contract.

## Escape Hatches

The repo intentionally keeps certain lower-level seams visible:

- raw Convex builders for cases like upload URLs
- raw mutations for onboarding or workspace-switch flows that intentionally cross tenant boundaries
- explicit cross-tenant reporting queries
- custom principal definitions for forwarded callers and agents

These are part of the design. Trellis should make the normal path easy without hiding where the abstraction ends.
