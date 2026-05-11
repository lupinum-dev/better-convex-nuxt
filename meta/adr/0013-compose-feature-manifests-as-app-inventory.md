# 0013: Compose Feature Manifests As The App Inventory

Status: Accepted
Date: 2026-04-29

## Context

Feature folders are useful as a file layout, but layout alone does not give Trellis enough information to enforce framework boundaries. The runtime and doctor need a reliable inventory of schema tables, permissions, tenant-scoped tables, global tables, capabilities, and operations.

## Decision

Feature folders expose manifests through `defineFeature(...)`, and apps compose them through `composeFeatures(...)`.

The composed manifest is the app inventory used to merge schema, collect permissions, derive tenant table classification, preserve explicit global-table classification, and catch duplicate feature/schema/permission declarations.

For Trellis 1.0, the shared inventory engine is also the source for `doctor`,
`upgrade --check`, public-surface checks, docs generation, and future
`explain` commands. Security claims should come from structured inventory and
metadata, not from ad hoc regex scans.

## Consequences

Feature folders are not only directories; they are typed framework boundaries.

Generated code, maintained examples, `doctor`, and analysis checks should prefer the composed manifest over hand-maintained parallel lists.

Schema tables with `workspaceId` and `by_workspace` can be derived as tenant-scoped, while explicit `globalTables` keep tenant-independent tables out of isolation.

Generated or derived inventory must be rebuildable from canonical descriptors or
manifests, and diagnostics must be safe to share.
