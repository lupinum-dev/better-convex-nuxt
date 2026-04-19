# Kanban Workspace Requirements

## Purpose

`labs/01-kanban-workspace` is archived legacy material kept as migration input and design pressure, not as a maintained reference example.

Its old job was to pressure-test Trellis against the hard parts of a Trello-style collaborative workspace app with:

- real auth
- explicit tenancy
- realtime multi-user collaboration
- role-based permissions
- ordering and reordering
- destructive operations with preview/confirm safety
- first-class MCP agent integration
- observability and auditability

It is no longer a framework reference. Use `examples/03-team-workspace`, `examples/04-saas-platform`, and `examples/07-mcp-reference` for maintained patterns.

## Product Goal

Historically, the example aimed to build a small but real Trello-style MVP:

- users sign in
- users belong to one or more workspaces
- each workspace contains multiple boards
- each board contains ordered columns
- each column contains ordered cards
- humans and agents can create, move, reorder, and archive within permission limits

The example should feel like a minimal collaborative work app, not a toy CRUD page.

## Design Principles

These notes describe the archived target shape, not the current public Trellis contract:

1. Hard cutovers over compatibility layers

- Do not preserve old runtime shapes or keep dual paths just to smooth migration inside the example.
- The example should show the best current Trellis shape directly.

2. Real complexity over fake simplicity

- Do not remove the hard parts by using demo shortcuts.
- Avoid patterns like “self-select your own role”, “single board only”, or “move card left/right”.

3. Minimal UI, maximal backend/runtime signal

- The UI can stay plain.
- The business model, operations, agent integration, and observability must be real.

4. Delete and simplify before adding abstraction

- Avoid helper layers that only mask bad foundations.
- Prefer direct, explainable data flow and operations.

## What This Example Must Prove

The example must prove that Trellis can handle:

- authenticated user flows
- principal and actor resolution
- tenant isolation
- explicit workspace membership
- role-gated reads and writes
- realtime board subscriptions
- arbitrary card and column reordering
- destructive preview/confirm execution
- agent workflows through MCP
- consistent observability across UI and MCP

## Required Quality Bar

The example is not acceptable unless the baseline is healthy.

Required:

- `pnpm typecheck` passes for the example
- the example runs end-to-end from clean setup
- README and requirements match actual implementation
- there are no obviously broken or stale example paths
- MCP wiring compiles and works
- observability wiring is actually exercised, not merely configured

## Functional Requirements

### 1. Authentication and Identity

The example must provide:

- sign up
- sign in
- sign out
- app-owned user record linked to auth identity

The example must distinguish:

- **principal**: authenticated identity from auth/runtime
- **actor**: application-level user + membership context used for permissions

Identity must work consistently across:

- UI-driven calls
- Convex functions
- destructive operations
- MCP tool calls

### 2. Workspace Model

The example must support multiple workspaces.

Required:

- a user may belong to multiple workspaces
- workspace membership must be modeled explicitly
- tenant-owned entities must belong to a workspace
- workspace selection must be explicit in the app

Rejected shortcut:

- storing a single `workspaceId` directly on the user as the actual membership model

That shape is not sufficient for a Trello-style workspace product and should not be the foundation of the example.

### 3. Membership and Roles

Roles must exist at the workspace level.

Minimum required roles:

- `owner`
- `admin`
- `member`
- `viewer`

Required behaviors:

- `viewer` can read but cannot create or mutate cards/columns/boards
- `member` can create and move cards
- `admin` can manage higher-impact workspace behavior
- `owner` has full control

Membership must be explicit.

Required:

- add member / invite member flow
- join/accept flow if invitations are modeled
- role changes must happen through real app actions

Rejected shortcut:

- typing a workspace slug and selecting your own role

### 4. Board Model

A workspace must contain multiple boards.

Required:

- create board
- list boards
- open a board
- switch between boards
- archive a board
- view active vs archived board state correctly

Rejected shortcut:

- “the current board is just the first unarchived board in the workspace”

That hides the real board lifecycle and weakens the example.

### 5. Column Model

Boards must contain ordered columns.

Required:

- create column
- rename column
- reorder columns

Optional for v1:

- archive column
- delete column

Column ordering must support repeated edits and not degrade quickly under normal use.

### 6. Card Model

Columns must contain ordered cards.

Required:

- create card
- rename/edit card
- move card across columns
- reorder card within a column
- insert card at a chosen destination

Optional for v1:

- description
- assignee
- labels
- due dates

Rejected shortcut:

- only move card left/right between adjacent columns
- always append moved cards to the end

That is not a serious Trello-like stress test.

### 7. Ordering and Reordering

This is one of the central stress points of the example.

The example must support:

- arbitrary card reordering
- cross-column moves with destination placement
- arbitrary column reordering

The API should reflect user intent directly.

Examples of acceptable operation shapes:

- `moveCard({ cardId, toColumnId, beforeCardId? })`
- `reorderColumn({ columnId, beforeColumnId? })`

The implementation does not need to prove the final best possible ranking strategy, but it must:

- be stable under repeated edits
- not rely on trivial append-only logic
- be explainable
- behave predictably under concurrent or near-concurrent activity

### 8. Realtime Collaboration

The example must demonstrate real collaboration, not only single-user mutation flows.

Required:

- board data updates live across multiple sessions
- membership and permission context do not leak cross-tenant data
- a second user sees card/column/board changes appropriately

The example should prove that realtime remains clean while combining:

- auth
- actor resolution
- tenant scoping
- permission gates

### 9. Destructive Operations

At least one real destructive operation must be modeled through Trellis operations.

Required destructive flow:

- archive board

Required characteristics:

- preview step
- confirm step
- safety token/redemption behavior if Trellis provides it
- audit trail
- clear user-facing impact summary

The same safety model must apply across:

- UI
- MCP

No hidden bypass for agents.

## MCP Requirements

## Purpose of MCP in This Example

MCP is a first-class requirement, not an optional extra.

This example should prove that Trellis can expose a workspace app to an agent cleanly and safely. The agent path should feel like a real product capability, not an internal debug backdoor.

## MCP Capability Requirements

The example must expose MCP tools for task-level business actions.

Required categories:

- workspace and board context resolution
- card creation
- card movement
- board archive preview
- board archive confirmation

Required user-intent examples:

- “add a card to my `XY` workspace”
- “add a card to board `Roadmap` in column `Doing`”
- “move card `TEST` to `Done`”
- “archive the board `Sprint 12`”
- “show me what will be archived before confirming”

## MCP Tool Design Rules

Tools must:

- represent business actions, not raw table mutations
- use readable, stable argument shapes
- apply the same guards and permissions as UI calls
- respect workspace membership and role constraints
- handle missing context safely

The agent path must not bypass:

- tenant isolation
- role checks
- destructive confirmation rules
- audit and observability

## MCP Ambiguity Handling

The example must handle common ambiguity cases explicitly.

Required cases:

- unknown workspace
- unknown board
- unknown column
- duplicate card titles
- missing active workspace context
- insufficient permissions

Expected behavior:

- return structured, useful errors or follow-up requirements
- do not guess destructively
- do not silently pick an arbitrary match when ambiguity matters

## MCP Actor Model

The example must make agent identity explicit.

Required:

- MCP principal resolution
- capability resolution based on the effective actor/membership
- consistent mapping between agent-triggered calls and business permissions

If the MCP runtime introduces an agent-specific principal shape, that shape must still resolve into the same application permission model rather than creating a parallel auth system.

## Observability Requirements

Observability is required, not decorative.

The example must integrate Trellis observability across:

- UI-originated queries and mutations
- destructive preview and execute phases
- MCP tool execution

Observability should make it possible to answer:

- who performed the action
- whether it was a human or agent path
- which workspace/tenant was affected
- which board/card/column was involved when applicable
- which operation or tool ran
- whether it succeeded or failed
- whether the action was preview or execute

## Minimum Observability Signals

At minimum, emitted telemetry should include:

- principal identity or principal key
- actor identity
- workspace/tenant identifier
- operation name
- MCP capability/tool name when applicable
- success/failure status
- relevant error category

The example should clearly demonstrate where observability is wired and how a developer would inspect it.

## Audit Requirements

Auditability is separate from generic telemetry.

Required:

- destructive operations must write durable audit records
- important membership changes should be auditable
- if feasible, major structural changes should also be auditable

Minimum audit coverage:

- board archive
- membership role change
- member add/invite acceptance

Preferred additional coverage:

- card move across columns
- column reorder

## API and Operation Requirements

The example should expose business actions as explicit operations/mutations/queries with clean boundaries.

The implementation should prefer direct domain operations over generic CRUD wrappers.

Required operation families:

- auth/session context
- workspace list/create/select
- membership management
- board list/create/open/archive
- column create/rename/reorder
- card create/edit/move/reorder
- destructive preview + confirm

The example should avoid generic mutations that push domain logic into the client.

## UI Requirements

The UI can remain intentionally plain, but it must expose the full core product flow.

Required screens or flows:

- auth flow
- workspace selection or entry
- board selection
- board view with columns and cards
- create/edit/move/reorder interactions
- archive preview and archive confirmation
- visible role context

Not required:

- design system
- rich styling
- polished drag-and-drop

If drag-and-drop is omitted in v1, the reorder semantics must still be real and testable through the UI or API.

## Testing Requirements

This example requires example-specific verification. Framework-level tests alone are not enough.

Required:

- typecheck passes
- example-specific integration tests or equivalent verification coverage

Minimum test coverage:

- principal and actor resolution
- tenant isolation
- membership and role gating
- board creation and selection
- card move and reorder semantics
- column reorder semantics
- destructive preview and confirm flow
- MCP capability gating

Recommended scenario coverage:

- two-user workspace collaboration
- viewer denied mutation attempts
- agent can perform allowed actions and is blocked from forbidden ones

## Documentation Requirements

The example README and requirements must describe the same thing.

README must include:

- what the example proves
- what is in scope
- what is intentionally out of scope
- setup and run instructions
- human demo flow
- MCP demo flow
- observability/audit demo notes

This `requirements.md` is the source of truth for the intended example scope. The README should be a developer-facing summary of the implemented version.

## Non-Goals for v1

These are explicitly out of scope unless later promoted:

- advanced styling
- comments
- checklists
- attachments
- labels
- due dates
- notifications
- full Trello parity
- plugin/power-up ecosystem

These may be follow-up examples or later extensions, but they should not distract from the core framework stress points.

## Rejected Simplifications

The example should not use these shortcuts:

- single workspace membership stored directly on the user as the real model
- self-assigned roles during join
- implicit single current board by query accident
- only-left/right card movement
- append-only ordering pretending to be reorder support
- MCP tools that wrap raw database access
- agent-only bypasses around destructive safety
- observability config that is present but not exercised

## Acceptance Criteria

The example is considered successful when a reviewer can do the following end-to-end:

1. Create two user accounts.
2. Create a workspace with user A.
3. Add user B to that workspace with a chosen role.
4. Create multiple boards in that workspace.
5. Open a board and create columns/cards.
6. Reorder columns.
7. Reorder cards within a column.
8. Move cards across columns into specific positions.
9. Verify that a viewer can read but cannot mutate.
10. Use MCP to create and move cards using natural workspace/board/card references.
11. Use MCP to preview and then confirm a board archive.
12. Inspect observability and audit output for both UI and MCP actions.
13. Run typecheck and relevant tests successfully.

## Recommended Delivery Order

To keep the example honest, work should proceed in this order:

1. Fix baseline health

- typecheck
- broken example wiring
- broken MCP wiring
- README truthfulness

2. Replace the current membership model

- explicit workspace membership
- proper role enforcement

3. Add real board lifecycle

- multiple boards
- board selection
- archive flow

4. Replace fake movement semantics

- real card move/reorder
- real column reorder

5. Make MCP first-class

- task-level tools
- ambiguity handling
- permission-correct capability resolution

6. Wire observability and audit properly

- UI + Convex + MCP

7. Add example-specific tests

## Final Standard

This example should be the one Trellis example that people read to judge whether the framework is capable of powering a serious collaborative app.

That means it must be:

- technically healthy
- honest about the hard parts
- minimal without being fake
- agent-capable
- observable
- safe for destructive actions

Anything less turns it into a demo. This file defines the bar for a reference example.
