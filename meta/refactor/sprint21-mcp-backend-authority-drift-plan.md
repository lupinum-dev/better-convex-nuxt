# Sprint 21: MCP Backend Authority Drift

## Goal

Finish the remaining Slice 6 proof that MCP capability visibility is advisory
and backend authorization is authoritative.

By the end of this sprint, if MCP visibility/capability checks allow a tool but
the backend protected handler denies execution, Trellis returns the backend
denial and emits a redacted drift observation. We should not add a second policy
model in MCP; the backend remains the source of truth.

## Why This Sprint Comes Next

Sprint 20 removed the standalone custom app-write escape hatch. The remaining
Slice 6 risk is subtler: MCP projection can say a tool is visible while the
backend later denies because actor/guard/load/authorize/tenant state changed or
was projected incorrectly.

That mismatch is allowed to happen. The important invariant is:

- backend denial wins;
- MCP does not retry or override it;
- the drift is observable so teams can fix stale capability projection.

## Current State

- Direct app-backed MCP tools check projected capabilities before visibility and
  execution.
- Operation-backed MCP tools check projected capabilities before preview or
  execute.
- Backend execution errors already return through the MCP result envelope.
- Backend auth denials are currently reported as generic `tool.failed`
  observations, so capability/backend drift is not visible as its own signal.

## Non-Goals

- Do not redesign capability projection.
- Do not add a new backend permission source.
- Do not infer backend policy in MCP.
- Do not make MCP visibility authoritative.
- Do not change Convex handler behavior.
- Do not migrate Ginko MCP wrappers in this sprint.

## Work Items

### 1. Add Drift Observation Vocabulary

- [x] Add a redacted observation reason for backend denial after MCP capability
      allowed execution.
- [x] Keep the event in the MCP/authorization family; no raw args, principal,
      delegation, bearer, token, or envelope data.
- [x] Keep generic backend failures as `tool.failed`; only auth denials become
      capability/backend drift.

### 2. Emit Drift From Direct Tool Execution

- [x] In `tool.query(...)` / `tool.mutation(...)`, when projected capability
      checks pass but backend execution returns an auth denial, emit the drift
      observation.
- [x] Return the backend denial unchanged to the caller.
- [x] Preserve existing success and generic failure observations.

### 3. Emit Drift From Operation Execution

- [x] In `tool.operation(...)`, when projected capability checks pass but
      preview or execute backend refs return an auth denial, emit the drift
      observation.
- [x] Include operation id and tool name when available.
- [x] Return the backend denial unchanged to the caller.

### 4. Tests And Docs

- [x] Unit test direct mutation drift observation.
- [x] Unit test operation execute drift observation.
- [x] Update MCP docs to state visibility is advisory and backend denial wins.
- [x] Update the main 1.0 tracker.

## Verification

Focused checks:

```bash
pnpm exec vitest run --project=unit tests/unit/define-convex-tool.test.ts
pnpm run check:docs:api-surface
pnpm run check:publish-surface
```

Search checks:

```bash
rg -n "capability_backend_drift|tool.capability_backend_drift" src tests apps/docs
```

## Acceptance Criteria

- [x] Backend auth denial remains the returned MCP result even when projected
      MCP capability allowed the tool.
- [x] Direct app-backed MCP tools emit capability/backend drift observations.
- [x] Operation-backed MCP tools emit capability/backend drift observations.
- [x] Generic non-auth backend failures remain `tool.failed`.
- [x] Slice 6 proof items are checked in `meta/trellis-1.0-refactor-plan.md`.
- [x] Sprint changes are committed after verification.

## Exit Notes

- Backend auth denials after MCP capability allowed execution now emit
  `tool.denied` with `tool.capability_backend_drift`.
- Direct `tool.query(...)` / `tool.mutation(...)` and `tool.operation(...)`
  return the backend denial result unchanged.
- Generic non-auth backend failures remain `tool.failed`.
- Docs now state that MCP visibility is advisory and backend authorization is
  authoritative.
